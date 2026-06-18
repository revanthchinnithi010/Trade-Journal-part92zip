/**
 * CtraderTickEngine
 *
 * Persistent ProtoOA TLS session for cTrader spot price streaming.
 * Flow: APP_AUTH_REQ → APP_AUTH_RES → ACCT_AUTH_REQ → ACCT_AUTH_RES
 *       → [SUBSCRIBE_SPOTS_REQ for watchlist symbols] → [SPOT_EVENT...]
 *
 * Subscription management:
 *   - Starts with ZERO subscriptions after authentication.
 *   - addSymbol(id, name)    — subscribe one symbol; idempotent (Set-backed).
 *   - removeSymbol(id, name) — unsubscribe one symbol.
 *   - On reconnect: re-subscribes all symbols in the Set automatically.
 *
 * Emits:
 *   "tick"   (CtraderTick)         — one per SPOT_EVENT
 *   "status" (EngineStatusPayload) — on every state transition
 */

import { EventEmitter } from "events";
import * as tls from "tls";
import { logger } from "../lib/logger.js";

// ── ProtoOA payload type IDs (from OpenApiModelMessages.proto) ───────────────
const PT = {
  APP_AUTH_REQ:          2100,
  APP_AUTH_RES:          2101,
  ACCT_AUTH_REQ:         2102,
  ACCT_AUTH_RES:         2103,
  SUBSCRIBE_SPOTS_REQ:   2127,
  SUBSCRIBE_SPOTS_RES:   2128,
  UNSUBSCRIBE_SPOTS_REQ: 2129,
  UNSUBSCRIBE_SPOTS_RES: 2130,
  SPOT_EVENT:            2131,
  ERROR_RES:             2142,
  HEARTBEAT_EVENT:       51,
} as const;

const PT_NAME: Record<number, string> = {
  2100: "APP_AUTH_REQ",  2101: "APP_AUTH_RES",
  2102: "ACCT_AUTH_REQ", 2103: "ACCT_AUTH_RES",
  2127: "SUBSCRIBE_SPOTS_REQ", 2128: "SUBSCRIBE_SPOTS_RES",
  2129: "UNSUBSCRIBE_SPOTS_REQ", 2130: "UNSUBSCRIBE_SPOTS_RES",
  2131: "SPOT_EVENT", 2142: "ERROR_RES", 51: "HEARTBEAT_EVENT",
};

// ── Protobuf encoding helpers ─────────────────────────────────────────────────
function varint(n: number): number[] {
  const out: number[] = [];
  let r = n >>> 0;
  do {
    const b = r & 0x7F;
    r >>>= 7;
    out.push(r > 0 ? b | 0x80 : b);
  } while (r > 0);
  return out;
}

function u32f(fn: number, v: number): number[] { return [...varint((fn << 3) | 0), ...varint(v)]; }
function strf(fn: number, s: string): number[] {
  const b = Buffer.from(s, "utf8");
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}
function bytesf(fn: number, b: Buffer): number[] {
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}
function boolField(fn: number, v: boolean): number[] {
  return [...varint((fn << 3) | 0), v ? 1 : 0];
}

function buildFrame(payloadType: number, inner: number[]): Buffer {
  const innerBuf = Buffer.from(inner);
  const outer    = Buffer.from([...u32f(1, payloadType), ...bytesf(2, innerBuf)]);
  const out      = Buffer.alloc(4 + outer.length);
  out.writeUInt32BE(outer.length, 0);
  outer.copy(out, 4);
  return out;
}

// ── Protobuf decoding — int64-safe (multiply, not bit-shift) ─────────────────
interface PbField { fn: number; wt: number; v: number | Buffer }

function readVarint(buf: Buffer, off: number): [number, number] {
  let v = 0, mul = 1;
  while (off < buf.length) {
    const b = buf[off++];
    v += (b & 0x7F) * mul;
    mul *= 128;
    if (!(b & 0x80)) break;
  }
  return [v, off];
}

function parseMsg(buf: Buffer): PbField[] {
  const out: PbField[] = [];
  let o = 0;
  while (o < buf.length) {
    let tag: number;
    [tag, o] = readVarint(buf, o);
    const fn = Math.floor(tag / 8);
    const wt = tag & 7;
    if (wt === 0) {
      let v: number; [v, o] = readVarint(buf, o); out.push({ fn, wt, v });
    } else if (wt === 2) {
      let len: number; [len, o] = readVarint(buf, o);
      out.push({ fn, wt, v: buf.slice(o, o + len) });
      o += len;
    } else if (wt === 1) { o += 8; }
    else if (wt === 5)   { o += 4; }
    else break;
  }
  return out;
}

function decodeFrame(raw: Buffer): { payloadType: number; payload: Buffer } | null {
  try {
    const fields  = parseMsg(raw);
    const ptField = fields.find(f => f.fn === 1 && f.wt === 0);
    const plField = fields.find(f => f.fn === 2 && f.wt === 2);
    if (!ptField) return null;
    return {
      payloadType: ptField.v as number,
      payload:     plField ? (plField.v as Buffer) : Buffer.alloc(0),
    };
  } catch { return null; }
}

// ── TLS connection helper ─────────────────────────────────────────────────────
type Conn = {
  write:      (buf: Buffer) => void;
  destroy:    () => void;
  onFrame:    ((pt: number, payload: Buffer) => void) | null;
  onConnect:  (() => void) | null;
  onError:    ((e: Error) => void) | null;
  onClose:    (() => void) | null;
};

function makeTlsConn(host: string, port: number): Conn {
  let recvBuf = Buffer.alloc(0);
  const conn: Conn = { write: () => {}, destroy: () => {}, onFrame: null, onConnect: null, onError: null, onClose: null };

  const sock = tls.connect({ host, port, rejectUnauthorized: false }, () => {
    conn.onConnect?.();
  });

  sock.on("data", (chunk: Buffer) => {
    recvBuf = Buffer.concat([recvBuf, chunk]);
    while (recvBuf.length >= 4) {
      const msgLen = recvBuf.readUInt32BE(0);
      if (msgLen === 0 || msgLen > 4_000_000) { recvBuf = Buffer.alloc(0); break; }
      if (recvBuf.length < 4 + msgLen) break;
      const raw = recvBuf.slice(4, 4 + msgLen);
      recvBuf   = recvBuf.slice(4 + msgLen);
      const msg = decodeFrame(raw);
      if (msg) conn.onFrame?.(msg.payloadType, msg.payload);
    }
  });

  sock.on("error", (e: Error) => conn.onError?.(e));
  sock.on("close", () => conn.onClose?.());

  conn.write   = (buf) => { try { sock.write(buf); } catch { /* ignore */ } };
  conn.destroy = ()    => { try { sock.destroy(); } catch { /* ignore */ } };

  return conn;
}

// ── Public types ──────────────────────────────────────────────────────────────
export type EngineStatus =
  | "idle" | "connecting" | "app_auth" | "acct_auth"
  | "subscribing" | "streaming" | "reconnecting" | "error" | "stopped";

export interface CtraderTick {
  symbol:    string;
  symbolId:  number;
  bid:       number;
  ask:       number;
  spread:    number;
  mid:       number;
  price:     number;   // alias of mid — for handleTick() compat
  timestamp: number;
  provider:  "ctrader";
}

export interface EngineStatusPayload {
  status:          EngineStatus;
  accountId:       number;
  isLive:          boolean;
  subscribedCount: number;
  subscribedSymbols: string[];
  tickCounts:      Record<string, number>;
  connectedAt:     number | null;
  lastTickAt:      number | null;
  reconnectCount:  number;
  error?:          string;
}

export interface EngineOptions {
  clientId:            string;
  clientSecret:        string;
  ctidTraderAccountId: number;
  accessToken:         string;
  isLive:              boolean;
  /** Full symbol catalog for decoding SPOT_EVENT payloads (symbolId → name). */
  symbolMap:           Map<number, string>;
}

// ── CtraderTickEngine ─────────────────────────────────────────────────────────
export class CtraderTickEngine extends EventEmitter {
  private _status: EngineStatus = "idle";
  private conn:    Conn | null  = null;
  private timer:   NodeJS.Timeout | null = null;
  private step:    "app_auth" | "acct_auth" | "subscribing" | "streaming" = "app_auth";
  private opts:    EngineOptions | null = null;

  /**
   * The canonical set of symbol IDs we want subscribed.
   * Persists across reconnects. NOT reset by configure().
   */
  private subscribedIds  = new Set<number>();

  private tickCounts  = new Map<string, number>();
  private lastTickMap = new Map<number, CtraderTick>();
  private connectedAt:   number | null = null;
  private lastTickAt:    number | null = null;
  private reconnectDelay = 2_000;
  private reconnectCount = 0;
  private stopped = false;

  configure(opts: EngineOptions): void { this.opts = opts; }

  /**
   * Subscribe to a single symbol by ProtoOA symbolId + name.
   * - Idempotent: duplicate calls for the same id are ignored.
   * - Updates the symbolMap so SPOT_EVENTs can be decoded.
   * - If already streaming, immediately sends SUBSCRIBE_SPOTS_REQ for this id.
   * - If in auth / reconnect phase, the id will be included in the next subscribe round.
   */
  addSymbol(symbolId: number, symbolName: string): void {
    if (!this.opts) {
      logger.warn({ symbolId, symbolName }, "CtraderTickEngine.addSymbol: engine not configured");
      return;
    }
    if (this.subscribedIds.has(symbolId)) {
      logger.debug({ symbolId, symbolName }, "CtraderTickEngine.addSymbol: already subscribed (noop)");
      return;
    }
    this.subscribedIds.add(symbolId);
    this.opts.symbolMap.set(symbolId, symbolName);
    logger.info({ symbolId, symbolName, engineStatus: this._status, total: this.subscribedIds.size },
      "CtraderTickEngine.addSymbol: symbol added");

    if (this._status === "streaming" && this.conn) {
      this.conn.write(this._buildSubscribeSpotsReq([symbolId]));
    }
  }

  /**
   * Unsubscribe from a single symbol.
   * - Idempotent: no-op if not subscribed.
   * - If streaming, immediately sends UNSUBSCRIBE_SPOTS_REQ.
   */
  removeSymbol(symbolId: number, symbolName: string): void {
    if (!this.subscribedIds.has(symbolId)) {
      logger.debug({ symbolId, symbolName }, "CtraderTickEngine.removeSymbol: not subscribed (noop)");
      return;
    }
    this.subscribedIds.delete(symbolId);
    logger.info({ symbolId, symbolName, engineStatus: this._status, remaining: this.subscribedIds.size },
      "CtraderTickEngine.removeSymbol: symbol removed");

    if (this._status === "streaming" && this.conn) {
      this.conn.write(this._buildUnsubscribeSpotsReq([symbolId]));
    }
  }

  getSubscribedSymbols(): string[] {
    if (!this.opts) return [];
    return [...this.subscribedIds].map(id => this.opts!.symbolMap.get(id) ?? String(id));
  }

  start(): void {
    if (!this.opts) throw new Error("CtraderTickEngine: call configure() before start()");
    this.stopped = false;
    this._setStatus("connecting");
    this._connect();
  }

  stop(): void {
    this.stopped = true;
    this._clearTimer();
    this.conn?.destroy();
    this.conn = null;
    this._setStatus("stopped");
  }

  getStatus(): EngineStatusPayload {
    return {
      status:            this._status,
      accountId:         this.opts?.ctidTraderAccountId ?? 0,
      isLive:            this.opts?.isLive ?? false,
      subscribedCount:   this.subscribedIds.size,
      subscribedSymbols: this.getSubscribedSymbols(),
      tickCounts:        Object.fromEntries(this.tickCounts),
      connectedAt:       this.connectedAt,
      lastTickAt:        this.lastTickAt,
      reconnectCount:    this.reconnectCount,
    };
  }

  getLastTick(symbolId: number): CtraderTick | null { return this.lastTickMap.get(symbolId) ?? null; }
  getAllLastTicks(): CtraderTick[]                   { return [...this.lastTickMap.values()]; }

  // ── Private helpers ─────────────────────────────────────────────────────────
  private _setStatus(s: EngineStatus, extra: Partial<EngineStatusPayload> = {}): void {
    this._status = s;
    this.emit("status", { ...this.getStatus(), ...extra });
  }

  private _clearTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private _scheduleReconnect(reason: string): void {
    if (this.stopped) return;
    this._clearTimer();
    this.reconnectCount++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, Math.min(this.reconnectCount - 1, 8)),
      60_000,
    );
    logger.info({ delay, reconnectCount: this.reconnectCount, reason }, "CtraderTickEngine: reconnecting");
    this._setStatus("reconnecting");
    this.timer = setTimeout(() => { if (!this.stopped) this._connect(); }, delay);
  }

  private _connect(): void {
    if (this.stopped || !this.opts) return;
    const { isLive } = this.opts;
    const host = isLive ? "live.ctraderapi.com" : "demo.ctraderapi.com";

    this.step = "app_auth";
    this.connectedAt = null;
    logger.info({ host, port: 5035 }, "CtraderTickEngine: opening TLS connection");
    this._setStatus("connecting");

    const conn = makeTlsConn(host, 5035);
    this.conn = conn;

    conn.onConnect = () => {
      logger.info("CtraderTickEngine: TLS connected → APP_AUTH_REQ");
      this._setStatus("app_auth");
      conn.write(this._buildAppAuthReq());
    };

    conn.onFrame = (pt, payload) => this._handleFrame(pt, payload);

    conn.onError = (e) => {
      logger.error({ err: String(e) }, "CtraderTickEngine: socket error");
      this.conn = null;
      this._scheduleReconnect(`socket_error: ${e.message}`);
    };

    conn.onClose = () => {
      if (this.stopped) return;
      logger.warn("CtraderTickEngine: connection closed unexpectedly");
      this.conn = null;
      this._scheduleReconnect("remote_close");
    };
  }

  private _handleFrame(pt: number, payload: Buffer): void {
    const name = PT_NAME[pt] ?? `UNKNOWN(${pt})`;

    if (pt === PT.HEARTBEAT_EVENT) return;

    if (pt === PT.ERROR_RES) {
      const { errorCode, description } = this._parseErrorRes(payload);
      logger.error({ errorCode, description, step: this.step }, "CtraderTickEngine: ERROR_RES");
      this._setStatus("error", { error: `ProtoOA ${errorCode}: ${description}` });
      this._scheduleReconnect(`error_res: ${errorCode}`);
      return;
    }

    switch (this.step) {
      case "app_auth": {
        if (pt !== PT.APP_AUTH_RES) { logger.warn({ got: name }, "CtraderTickEngine: unexpected frame in app_auth"); return; }
        logger.info("CtraderTickEngine: ✓ APP_AUTH_RES → ACCT_AUTH_REQ");
        this.step = "acct_auth";
        this._setStatus("acct_auth");
        this.conn!.write(this._buildAcctAuthReq());
        break;
      }
      case "acct_auth": {
        if (pt !== PT.ACCT_AUTH_RES) { logger.warn({ got: name }, "CtraderTickEngine: unexpected frame in acct_auth"); return; }
        this.connectedAt   = Date.now();
        this.reconnectDelay = 2_000;
        this.reconnectCount = 0;

        const ids = [...this.subscribedIds];
        if (ids.length > 0) {
          // Re-subscribe all watchlist symbols
          logger.info({ count: ids.length }, "CtraderTickEngine: ✓ ACCT_AUTH_RES → SUBSCRIBE_SPOTS_REQ");
          this.step = "subscribing";
          this._setStatus("subscribing");
          this.conn!.write(this._buildSubscribeSpotsReq(ids));
        } else {
          // No watchlist symbols yet — go straight to streaming; addSymbol() will subscribe later
          logger.info("CtraderTickEngine: ✓ ACCT_AUTH_RES — no watchlist symbols yet, standing by");
          this.step = "streaming";
          this._setStatus("streaming");
        }
        break;
      }
      case "subscribing": {
        if (pt === PT.SUBSCRIBE_SPOTS_RES) {
          logger.info("CtraderTickEngine: ✓ SUBSCRIBE_SPOTS_RES — streaming");
          this.step = "streaming";
          this._setStatus("streaming");
        } else if (pt === PT.SPOT_EVENT) {
          // First spot can arrive before the RES
          this.step = "streaming";
          this._setStatus("streaming");
          this._handleSpotEvent(payload);
        } else {
          logger.debug({ got: name }, "CtraderTickEngine: unexpected frame in subscribing");
        }
        break;
      }
      case "streaming": {
        if (pt === PT.SPOT_EVENT) {
          this._handleSpotEvent(payload);
        } else if (pt === PT.SUBSCRIBE_SPOTS_RES) {
          logger.debug("CtraderTickEngine: SUBSCRIBE_SPOTS_RES ack (dynamic add)");
        } else if (pt === PT.UNSUBSCRIBE_SPOTS_RES) {
          logger.debug("CtraderTickEngine: UNSUBSCRIBE_SPOTS_RES ack");
        } else {
          logger.debug({ got: name }, "CtraderTickEngine: unhandled frame in streaming");
        }
        break;
      }
    }
  }

  private _handleSpotEvent(payload: Buffer): void {
    const fields = parseMsg(payload);
    const symbolIdF = fields.find(f => f.fn === 3 && f.wt === 0);
    const bidF      = fields.find(f => f.fn === 4 && f.wt === 0);
    const askF      = fields.find(f => f.fn === 5 && f.wt === 0);
    const tsF       = fields.find(f => f.fn === 8 && f.wt === 0);

    const symbolId = symbolIdF ? (symbolIdF.v as number) : 0;
    if (!symbolId) return;

    const symbolName = this.opts?.symbolMap.get(symbolId);
    if (!symbolName) return;

    const bid       = bidF ? (bidF.v as number) / 100000 : 0;
    const ask       = askF ? (askF.v as number) / 100000 : 0;
    const mid       = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid || ask;
    const spread    = bid > 0 && ask > 0 ? ask - bid : 0;
    const timestamp = tsF ? (tsF.v as number) : Date.now();

    const tick: CtraderTick = {
      symbol: symbolName, symbolId,
      bid, ask, spread, mid, price: mid,
      timestamp, provider: "ctrader",
    };

    this.lastTickMap.set(symbolId, tick);
    this.lastTickAt = Date.now();
    const prev = this.tickCounts.get(symbolName) ?? 0;
    this.tickCounts.set(symbolName, prev + 1);

    const total = prev + 1;
    if (total <= 5 || total % 500 === 0) {
      logger.info({
        symbol: symbolName, bid: bid.toFixed(6), ask: ask.toFixed(6),
        spread: spread.toFixed(6), tickCount: total,
      }, "CtraderTickEngine: SPOT_EVENT");
    }

    this.emit("tick", tick);
  }

  // ── Message builders ─────────────────────────────────────────────────────────
  private _buildAppAuthReq(): Buffer {
    const { clientId, clientSecret } = this.opts!;
    return buildFrame(PT.APP_AUTH_REQ, [
      ...u32f(1, PT.APP_AUTH_REQ),
      ...strf(2, clientId),
      ...strf(3, clientSecret),
    ]);
  }

  private _buildAcctAuthReq(): Buffer {
    const { ctidTraderAccountId, accessToken } = this.opts!;
    return buildFrame(PT.ACCT_AUTH_REQ, [
      ...u32f(1, PT.ACCT_AUTH_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...strf(3, accessToken),
    ]);
  }

  private _buildSubscribeSpotsReq(symbolIds: number[]): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    return buildFrame(PT.SUBSCRIBE_SPOTS_REQ, [
      ...u32f(1, PT.SUBSCRIBE_SPOTS_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...symbolIds.flatMap(id => u32f(3, id)),
      ...boolField(4, true), // subscribeToSpotTimestamp = true
    ]);
  }

  private _buildUnsubscribeSpotsReq(symbolIds: number[]): Buffer {
    const { ctidTraderAccountId } = this.opts!;
    return buildFrame(PT.UNSUBSCRIBE_SPOTS_REQ, [
      ...u32f(1, PT.UNSUBSCRIBE_SPOTS_REQ),
      ...u32f(2, ctidTraderAccountId),
      ...symbolIds.flatMap(id => u32f(3, id)),
    ]);
  }

  private _parseErrorRes(payload: Buffer): { errorCode: number | string; description: string } {
    const fields = parseMsg(payload);
    const code   = fields.find(f => f.fn === 2 && f.wt === 0)?.v ?? "?";
    const descF  = fields.find(f => f.fn === 3 && f.wt === 2);
    return {
      errorCode:   code as number,
      description: descF ? (descF.v as Buffer).toString("utf8") : "",
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const ctraderTickEngine = new CtraderTickEngine();
