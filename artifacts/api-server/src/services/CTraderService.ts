import * as tls from "tls";
import * as https from "https";
import * as querystring from "querystring";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { encrypt } from "./BrokerEncryption.js";
import { BrokerService } from "../brokers/BrokerService.js";

// ─── Protobuf helpers ────────────────────────────────────────────────────────

function encodeVarint(n: bigint): Buffer {
  const bytes: number[] = [];
  let val = n < 0n ? BigInt.asUintN(64, n) : n;
  do {
    let b = Number(val & 0x7fn);
    val >>= 7n;
    if (val > 0n) b |= 0x80;
    bytes.push(b);
  } while (val > 0n);
  return Buffer.from(bytes);
}

function zigzag(n: bigint): bigint {
  return (n < 0n ? (-n * 2n - 1n) : n * 2n);
}

function dezigzag(n: bigint): bigint {
  return (n & 1n) === 0n ? n >> 1n : -(n >> 1n) - 1n;
}

function varintField(num: number, n: bigint): Buffer {
  return Buffer.concat([encodeVarint(BigInt((num << 3) | 0)), encodeVarint(n)]);
}

function sint64Field(num: number, n: bigint): Buffer {
  return Buffer.concat([encodeVarint(BigInt((num << 3) | 0)), encodeVarint(zigzag(n))]);
}

function stringField(num: number, s: string): Buffer {
  const data = Buffer.from(s, "utf8");
  return Buffer.concat([encodeVarint(BigInt((num << 3) | 2)), encodeVarint(BigInt(data.length)), data]);
}

function bytesField(num: number, data: Buffer): Buffer {
  return Buffer.concat([encodeVarint(BigInt((num << 3) | 2)), encodeVarint(BigInt(data.length)), data]);
}

function decodeVarint(buf: Buffer, pos: number): [bigint, number] {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}

interface PbField { num: number; type: number; varint?: bigint; bytes?: Buffer; }

function decodeFields(buf: Buffer): PbField[] {
  const fields: PbField[] = [];
  let pos = 0;
  try {
    while (pos < buf.length) {
      let tag: bigint;
      [tag, pos] = decodeVarint(buf, pos);
      const num = Number(tag >> 3n);
      const type = Number(tag & 7n);
      if (type === 0) {
        let v: bigint;
        [v, pos] = decodeVarint(buf, pos);
        fields.push({ num, type, varint: v });
      } else if (type === 2) {
        let len: bigint;
        [len, pos] = decodeVarint(buf, pos);
        const bytes = buf.slice(pos, pos + Number(len));
        pos += Number(len);
        fields.push({ num, type, bytes });
      } else {
        break;
      }
    }
  } catch {}
  return fields;
}

// ─── Message framing ─────────────────────────────────────────────────────────

const PT = {
  HEARTBEAT: 51,
  APP_AUTH_REQ: 2100, APP_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102, ACCOUNT_AUTH_RES: 2103,
  SYMBOLS_LIST_REQ: 2114, SYMBOLS_LIST_RES: 2115,
  SUBSCRIBE_SPOTS_REQ: 2127, SPOT_EVENT: 2131,
  SYMBOL_BY_ID_REQ: 2119, SYMBOL_BY_ID_RES: 2120,
  GET_ACCOUNTS_REQ: 2149, GET_ACCOUNTS_RES: 2150,
  ERROR_RES: 2142,
} as const;

function buildFrame(payloadType: number, payload: Buffer, clientMsgId?: string): Buffer {
  let msg = Buffer.concat([varintField(1, BigInt(payloadType)), bytesField(2, payload)]);
  if (clientMsgId) msg = Buffer.concat([msg, stringField(3, clientMsgId)]);
  const frame = Buffer.allocUnsafe(4 + msg.length);
  frame.writeUInt32BE(msg.length, 0);
  msg.copy(frame, 4);
  return frame;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CTraderAccount {
  ctidTraderAccountId: bigint;
  traderLogin: string;
  isLive: boolean;
  brokerName?: string;
  balance?: number;
  equity?: number;
  currency?: string;
}

export interface CTraderTick {
  bid: number;
  ask: number;
  ts: number;
}

type State = "disconnected" | "connecting" | "app_auth" | "get_accounts"
           | "account_auth" | "fetch_symbols" | "fetch_symbol_details" | "subscribed" | "error";

// ─── OAuth helpers ───────────────────────────────────────────────────────────

const CTRADER_AUTH_HOST = "connect.spotware.com";

async function httpPost(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const encoded = querystring.stringify(body);
    const req = https.request({
      hostname: CTRADER_AUTH_HOST,
      path, method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(encoded) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Non-JSON response: ${data}`)); }
      });
    });
    req.on("error", reject);
    req.write(encoded);
    req.end();
  });
}

// ─── Main service ─────────────────────────────────────────────────────────────

export class CTraderService extends EventEmitter {
  private socket: tls.TLSSocket | null = null;
  private rxBuf = Buffer.alloc(0);
  private state: State = "disconnected";
  private lastError: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hbSentAt = 0;
  latencyMs = 0;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  private accounts: CTraderAccount[] = [];
  private activeAccount: CTraderAccount | null = null;

  // symbol name → symbolId
  private symbolIds = new Map<string, bigint>();
  // symbolId → { name, digits }
  private symbolMeta = new Map<bigint, { name: string; digits: number }>();
  // symbol name → latest tick
  readonly ticks = new Map<string, CTraderTick>();
  // track pending SYMBOL_BY_ID_REQ batches before we can subscribe
  private detailBatchesPending = 0;


  get isConnected() { return this.state === "subscribed"; }
  get connectionState() { return this.state; }
  get connectedAccounts() { return this.accounts; }
  get currentAccessToken(): string | null { return this.accessToken; }

  // ── Init ──────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.ensureTable();
    await this.ensureOAuthStateTable();
    const row = await this.loadToken();
    if (!row) {
      logger.info("CTraderService: no stored token — awaiting OAuth");
      return;
    }
    this.accessToken = row.access_token;
    this.refreshToken = row.refresh_token;
    this.tokenExpiresAt = row.expires_at ? new Date(row.expires_at) : null;

    if (this.isTokenExpired()) {
      logger.info("CTraderService: token expired, attempting refresh");
      try { await this.refreshAccessToken(); }
      catch (err) { logger.warn({ err }, "CTraderService: token refresh failed"); return; }
    }

    this.connect();
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  buildAuthUrl(redirectUri: string, state?: string): string {
    const id = process.env["CTRADER_CLIENT_ID"];
    if (!id) throw new Error("CTRADER_CLIENT_ID not set");
    const params: Record<string, string> = { client_id: id, redirect_uri: redirectUri, scope: "trading", response_type: "code" };
    if (state) params["state"] = state;
    const p = new URLSearchParams(params);
    return `https://connect.spotware.com/apps/auth?${p.toString()}`;
  }

  async createOAuthState(): Promise<string> {
    await this.ensureOAuthStateTable();
    const state = randomUUID();
    await pool.query(
      "INSERT INTO ctrader_oauth_state (state) VALUES ($1)",
      [state],
    );
    await pool.query("DELETE FROM ctrader_oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'");
    return state;
  }

  async validateOAuthState(state: string): Promise<boolean> {
    await this.ensureOAuthStateTable();
    const r = await pool.query(
      "DELETE FROM ctrader_oauth_state WHERE state = $1 RETURNING state",
      [state],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async handleOAuthCode(code: string, redirectUri: string): Promise<void> {
    const id = process.env["CTRADER_CLIENT_ID"];
    const secret = process.env["CTRADER_CLIENT_SECRET"];
    if (!id || !secret) throw new Error("CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET not configured");

    logger.info("CTraderService: exchanging OAuth code for tokens");
    const res = await httpPost("/apps/token", {
      grant_type: "authorization_code",
      code, client_id: id, client_secret: secret, redirect_uri: redirectUri,
    });

    if (res["error"]) throw new Error(String(res["error_description"] ?? res["error"]));

    this.accessToken = String(res["access_token"]);
    this.refreshToken = String(res["refresh_token"]);
    const expiresIn = Number(res["expires_in"] ?? 3600);
    this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.saveToken();
    this.connect();
  }

  async disconnect(): Promise<void> {
    this.clearTimers();
    this.socket?.destroy();
    this.socket = null;
    this.state = "disconnected";
    this.accounts = [];
    this.activeAccount = null;
    this.symbolIds.clear();
    this.symbolMeta.clear();
    this.ticks.clear();
    await this.clearToken();
    this.accessToken = null;
    this.refreshToken = null;
    this.emit("status_change", this.getStatus());
  }

  // ── TLS connect ───────────────────────────────────────────────────────────

  private connect(): void {
    if (this.state !== "disconnected" && this.state !== "error") return;
    this.clearTimers();
    this.state = "connecting";
    this.rxBuf = Buffer.alloc(0);

    // Configurable endpoint: CTRADER_ENV=demo uses demo.ctraderapi.com:5035
    // Override with CTRADER_API_HOST / CTRADER_API_PORT env vars as needed.
    const env  = (process.env["CTRADER_ENV"] ?? "live").toLowerCase();
    const host = process.env["CTRADER_API_HOST"] ?? (env === "demo" ? "demo.ctraderapi.com" : "live.ctraderapi.com");
    const port = Number(process.env["CTRADER_API_PORT"] ?? (env === "demo" ? "5035" : "5036"));
    logger.info({ host, port, env }, "CTraderService: connecting");

    const sock = tls.connect({ host, port, rejectUnauthorized: true });
    this.socket = sock;

    sock.on("secureConnect", () => {
      logger.info("CTraderService: TLS connected — sending AppAuth");
      this.state = "app_auth";
      this.sendAppAuth();
      this.startHeartbeat();
    });

    sock.on("data", (chunk: Buffer) => { this.onData(chunk); });

    sock.on("close", () => {
      logger.warn("CTraderService: socket closed");
      this.onDisconnected();
    });

    sock.on("error", (err) => {
      logger.warn({ err: err.message }, "CTraderService: socket error");
      this.onDisconnected();
    });
  }

  private onDisconnected(): void {
    this.clearTimers();
    const wasConnected = this.state === "subscribed";
    this.state = "disconnected";
    this.symbolIds.clear();
    this.symbolMeta.clear();
    this.emit("status_change", this.getStatus());
    if (wasConnected || this.accessToken) {
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    }
  }

  // ── Frame parsing ─────────────────────────────────────────────────────────

  private onData(chunk: Buffer): void {
    this.rxBuf = Buffer.concat([this.rxBuf, chunk]);
    while (this.rxBuf.length >= 4) {
      const msgLen = this.rxBuf.readUInt32BE(0);
      if (this.rxBuf.length < 4 + msgLen) break;
      const msgBuf = this.rxBuf.slice(4, 4 + msgLen);
      this.rxBuf = this.rxBuf.slice(4 + msgLen);
      this.onMessage(msgBuf);
    }
  }

  private onMessage(buf: Buffer): void {
    const outer = decodeFields(buf);
    const payloadTypeField = outer.find(f => f.num === 1 && f.type === 0);
    const payloadField = outer.find(f => f.num === 2 && f.type === 2);
    if (!payloadTypeField?.varint) return;

    const pt = Number(payloadTypeField.varint);
    const payload = payloadField?.bytes ?? Buffer.alloc(0);

    switch (pt) {
      case PT.APP_AUTH_RES:
        logger.info("CTraderService: App auth OK → fetching accounts");
        this.state = "get_accounts";
        this.sendGetAccounts();
        break;

      case PT.GET_ACCOUNTS_RES:
        this.handleGetAccountsRes(payload);
        break;

      case PT.ACCOUNT_AUTH_RES:
        this.handleAccountAuthRes(payload);
        break;

      case PT.SYMBOLS_LIST_RES:
        this.handleSymbolsListRes(payload);
        break;

      case PT.SYMBOL_BY_ID_RES:
        this.handleSymbolByIdRes(payload);
        break;

      case PT.SPOT_EVENT:
        this.handleSpotEvent(payload);
        break;

      case PT.HEARTBEAT:
        this.latencyMs = this.hbSentAt ? Date.now() - this.hbSentAt : 0;
        this.send(PT.HEARTBEAT, Buffer.alloc(0));
        break;

      case PT.ERROR_RES: {
        const fields = decodeFields(payload);
        const errCode = fields.find(f => f.num === 2)?.varint;
        const desc = fields.find(f => f.num === 3)?.bytes?.toString("utf8");
        logger.warn({ errCode: Number(errCode), desc }, "CTraderService: error response");
        break;
      }

      default:
        break;
    }
  }

  // ── Protocol messages ─────────────────────────────────────────────────────

  private send(payloadType: number, payload: Buffer): void {
    if (!this.socket?.writable) return;
    this.socket.write(buildFrame(payloadType, payload));
  }

  private sendAppAuth(): void {
    const id = process.env["CTRADER_CLIENT_ID"] ?? "";
    const secret = process.env["CTRADER_CLIENT_SECRET"] ?? "";
    const payload = Buffer.concat([stringField(1, id), stringField(2, secret)]);
    this.send(PT.APP_AUTH_REQ, payload);
  }

  private sendGetAccounts(): void {
    const payload = stringField(1, this.accessToken ?? "");
    this.send(PT.GET_ACCOUNTS_REQ, payload);
  }

  private handleGetAccountsRes(buf: Buffer): void {
    const fields = decodeFields(buf);
    const accounts: CTraderAccount[] = [];
    for (const f of fields) {
      if (f.num === 1 && f.type === 2 && f.bytes) {
        const sub = decodeFields(f.bytes);
        const id = sub.find(s => s.num === 1 && s.type === 0)?.varint;
        const isLive = sub.find(s => s.num === 2 && s.type === 0)?.varint;
        const login = sub.find(s => s.num === 3 && s.type === 2)?.bytes?.toString("utf8");
        if (id !== undefined) {
          accounts.push({
            ctidTraderAccountId: dezigzag(id),
            isLive: isLive === 1n,
            traderLogin: login ?? "",
          });
        }
      }
    }
    this.accounts = accounts;
    logger.info({ accounts: accounts.length }, "CTraderService: got account list");

    const live = accounts.find(a => a.isLive) ?? accounts[0];
    if (!live) {
      logger.warn("CTraderService: no accounts found");
      this.lastError = "No trading accounts found for this token";
      return;
    }
    this.activeAccount = live;
    // Persist the resolved ctidAccountId back to broker_accounts so REST calls work
    // (The OAuth callback may have stored "pending" if the initial REST fetch failed)
    void this.persistResolvedAccountId(live.ctidTraderAccountId.toString());
    this.state = "account_auth";
    const payload = Buffer.concat([
      sint64Field(1, live.ctidTraderAccountId),
      stringField(2, this.accessToken ?? ""),
    ]);
    this.send(PT.ACCOUNT_AUTH_REQ, payload);
  }

  /** Writes the TLS-resolved ctidAccountId into broker_accounts and evicts the adapter cache. */
  private async persistResolvedAccountId(ctidId: string): Promise<void> {
    try {
      const enc = encrypt(ctidId);
      const result = await pool.query(
        `UPDATE broker_accounts SET api_secret_enc = $1 WHERE broker_id = 'ctrader'`,
        [enc],
      );
      if ((result.rowCount ?? 0) > 0) {
        // Evict cached adapters so the next REST call rebuilds with the correct account ID
        const rows = await pool.query<{ id: number }>(
          `SELECT id FROM broker_accounts WHERE broker_id = 'ctrader'`,
        );
        for (const row of rows.rows) {
          BrokerService.evict(row.id);
        }
        logger.info({ ctidId }, "CTraderService: ctidAccountId persisted to DB — adapter cache evicted");
      }
    } catch (err) {
      logger.warn({ err }, "CTraderService: failed to persist ctidAccountId — REST calls may use stale value");
    }
  }

  private handleAccountAuthRes(buf: Buffer): void {
    const fields = decodeFields(buf);
    const acctId = fields.find(f => f.num === 1 && f.type === 0)?.varint;
    logger.info({ acctId: acctId ? dezigzag(acctId).toString() : "?" }, "CTraderService: account auth OK → fetching symbols");
    this.state = "fetch_symbols";
    const payload = sint64Field(1, this.activeAccount!.ctidTraderAccountId);
    this.send(PT.SYMBOLS_LIST_REQ, payload);
  }

  private handleSymbolsListRes(buf: Buffer): void {
    const fields = decodeFields(buf);
    const found = new Map<string, bigint>();
    for (const f of fields) {
      if (f.num === 2 && f.type === 2 && f.bytes) {
        const sub = decodeFields(f.bytes);
        const rawId = sub.find(s => s.num === 1 && s.type === 0)?.varint;
        const enabled = sub.find(s => s.num === 3 && s.type === 0)?.varint;
        const name = sub.find(s => s.num === 2 && s.type === 2)?.bytes?.toString("utf8");
        if (rawId !== undefined && name && enabled !== 0n) {
          const id = dezigzag(rawId);
          found.set(name, id);
        }
      }
    }

    if (found.size === 0) {
      logger.warn("CTraderService: no symbols found in list");
      return;
    }

    this.symbolIds = found;
    logger.info({ count: found.size }, "CTraderService: symbol IDs resolved — fetching details");

    this.state = "fetch_symbol_details";
    // Batch SYMBOL_BY_ID_REQ in chunks of 500 to stay within message size limits
    const ids = [...found.values()];
    const CHUNK = 500;
    const numChunks = Math.ceil(ids.length / CHUNK);
    this.detailBatchesPending = numChunks;
    for (let i = 0; i < ids.length; i += CHUNK) {
      let payload = sint64Field(1, this.activeAccount!.ctidTraderAccountId);
      for (const id of ids.slice(i, i + CHUNK)) payload = Buffer.concat([payload, sint64Field(2, id)]);
      this.send(PT.SYMBOL_BY_ID_REQ, payload);
    }
  }

  private handleSymbolByIdRes(buf: Buffer): void {
    const fields = decodeFields(buf);
    for (const f of fields) {
      if (f.num === 2 && f.type === 2 && f.bytes) {
        const sub = decodeFields(f.bytes);
        const rawId = sub.find(s => s.num === 1 && s.type === 0)?.varint;
        const name = sub.find(s => s.num === 2 && s.type === 2)?.bytes?.toString("utf8");
        const digitsF = sub.find(s => s.num === 14 && s.type === 0)?.varint;
        if (rawId !== undefined && name) {
          const id = dezigzag(rawId);
          const digits = Number(digitsF ?? BigInt(this._guessDigits(name)));
          this.symbolMeta.set(id, { name, digits });
        }
      }
    }

    this.detailBatchesPending--;
    if (this.detailBatchesPending > 0) {
      logger.debug({ remaining: this.detailBatchesPending }, "CTraderService: waiting for more detail batches");
      return;
    }
    logger.info({ count: this.symbolMeta.size }, "CTraderService: all symbol details fetched → subscribing spots");
    this.subscribeToSpots();
  }

  private subscribeToSpots(): void {
    if (!this.activeAccount || this.symbolIds.size === 0) return;
    // Subscribe to ALL symbols from the broker in batches of 500
    const ids = [...this.symbolIds.values()];
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      let payload = sint64Field(1, this.activeAccount.ctidTraderAccountId);
      for (const id of ids.slice(i, i + CHUNK)) payload = Buffer.concat([payload, sint64Field(2, id)]);
      this.send(PT.SUBSCRIBE_SPOTS_REQ, payload);
    }
    this.state = "subscribed";
    logger.info({ count: this.symbolIds.size }, "CTraderService: subscribed to all spot prices ✓");
    this.emit("status_change", this.getStatus());
    // Notify listeners of the full live symbol catalog
    this.emit("symbols_loaded", [...this.symbolIds.keys()]);
  }

  /** Digit-precision heuristic for symbols missing SYMBOL_BY_ID_RES coverage. */
  private _guessDigits(name: string): number {
    const s = name.toUpperCase();
    if (s.includes("JPY") || s.includes("HUF") || s.includes("CZK")) return 3;
    if (s === "XAUUSD" || s === "XAGUSD") return 2;
    if (/^[A-Z]{6}$/.test(s)) return 5;
    if (/^(US30|DOW|DJIA)/.test(s)) return 1;
    if (/^(NAS|NDX|DAX|CAC|FTSE|GER|UK1|SP5|SPX|NIK|HAN|AUS|CHI)/.test(s)) return 1;
    if (/USDT$/.test(s) || /BTC|ETH|SOL/.test(s)) return 2;
    return 5;
  }

  /** Returns the complete list of symbols available from the connected broker. */
  getLoadedSymbols(): string[] { return [...this.symbolIds.keys()]; }

  /** Returns the cTrader numeric symbol ID for a given symbol name. */
  getSymbolId(name: string): bigint | undefined { return this.symbolIds.get(name); }

  private handleSpotEvent(buf: Buffer): void {
    const fields = decodeFields(buf);
    const rawSymId = fields.find(f => f.num === 2 && f.type === 0)?.varint;
    const bidRaw = fields.find(f => f.num === 3 && f.type === 0)?.varint;
    const askRaw = fields.find(f => f.num === 4 && f.type === 0)?.varint;

    if (!rawSymId || (!bidRaw && !askRaw)) return;
    const symId = dezigzag(rawSymId);
    const meta = this.symbolMeta.get(symId);
    if (!meta) return;

    const divisor = Math.pow(10, meta.digits);
    const existing = this.ticks.get(meta.name);
    const tick: CTraderTick = {
      bid: bidRaw ? Number(bidRaw) / divisor : (existing?.bid ?? 0),
      ask: askRaw ? Number(askRaw) / divisor : (existing?.ask ?? 0),
      ts: Date.now(),
    };
    this.ticks.set(meta.name, tick);
    this.emit("tick", { symbol: meta.name, bid: tick.bid, ask: tick.ask, ts: tick.ts, source: "ctrader" });
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.hbSentAt = Date.now();
      this.send(PT.HEARTBEAT, Buffer.alloc(0));
    }, 10_000);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  // ── Token refresh ─────────────────────────────────────────────────────────

  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false;
    return Date.now() > this.tokenExpiresAt.getTime() - 60_000;
  }

  private async refreshAccessToken(): Promise<void> {
    const id = process.env["CTRADER_CLIENT_ID"] ?? "";
    const secret = process.env["CTRADER_CLIENT_SECRET"] ?? "";
    const res = await httpPost("/apps/token", {
      grant_type: "refresh_token",
      refresh_token: this.refreshToken ?? "",
      client_id: id, client_secret: secret,
    });
    if (res["error"]) throw new Error(String(res["error"]));
    this.accessToken = String(res["access_token"]);
    this.refreshToken = String(res["refresh_token"] ?? this.refreshToken);
    const expiresIn = Number(res["expires_in"] ?? 3600);
    this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await this.saveToken();
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getStatus() {
    const stateOrder = [
      "disconnected", "connecting", "app_auth", "get_accounts",
      "account_auth", "fetch_symbols", "fetch_symbol_details", "subscribed",
    ] as const;
    const stateIdx = stateOrder.indexOf(this.state as typeof stateOrder[number]);
    return {
      configured: !!(process.env["CTRADER_CLIENT_ID"] && process.env["CTRADER_CLIENT_SECRET"]),
      connected: this.state === "subscribed",
      state: this.state,
      stateIdx,
      hasToken: !!(this.accessToken),
      activeAccountId: this.activeAccount?.ctidTraderAccountId.toString() ?? null,
      latencyMs: this.latencyMs,
      accounts: this.accounts.map(a => ({
        id: a.ctidTraderAccountId.toString(),
        login: a.traderLogin,
        isLive: a.isLive,
      })),
      ticks: Object.fromEntries([...this.ticks.entries()]),
      symbolCount: this.symbolIds.size,
      lastError: this.lastError ?? null,
    };
  }

  // ── DB helpers ────────────────────────────────────────────────────────────

  private async ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ctrader_connections (
        id            SERIAL PRIMARY KEY,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async loadToken(): Promise<{ access_token: string; refresh_token: string; expires_at: Date | null } | null> {
    const r = await pool.query("SELECT * FROM ctrader_connections ORDER BY id DESC LIMIT 1");
    return r.rows[0] ?? null;
  }

  private async saveToken(): Promise<void> {
    await pool.query("DELETE FROM ctrader_connections");
    await pool.query(
      "INSERT INTO ctrader_connections (access_token, refresh_token, expires_at) VALUES ($1, $2, $3)",
      [this.accessToken, this.refreshToken, this.tokenExpiresAt],
    );
  }

  private async clearToken(): Promise<void> {
    await pool.query("DELETE FROM ctrader_connections");
  }

  private async ensureOAuthStateTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ctrader_oauth_state (
        state      TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}
