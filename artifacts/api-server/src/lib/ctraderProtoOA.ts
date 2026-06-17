import WebSocket from "ws";
import { logger } from "./logger.js";

// ── ProtoOA WebSocket endpoints ────────────────────────────────────────────────
const DEMO_HOST = "demo.ctraderapi.com";
const LIVE_HOST = "live.ctraderapi.com";
const PORT      = 5036;

// ── Payload type IDs ───────────────────────────────────────────────────────────
const PT = {
  APP_AUTH_REQ:     2100,
  APP_AUTH_RES:     2101,
  ACCT_AUTH_REQ:    2102,
  ACCT_AUTH_RES:    2103,
  SYMBOL_LIST_REQ:  2115,
  SYMBOL_LIST_RES:  2116,
  SYMBOL_BY_ID_REQ: 2117,
  SYMBOL_BY_ID_RES: 2118,
  ERROR_RES:        2142,
} as const;

// ── Minimal protobuf encoder ───────────────────────────────────────────────────
function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7F) { out.push((n & 0x7F) | 0x80); n >>>= 7; }
  out.push(n & 0x7F);
  return out;
}
// uint32 varint field  (wire type 0)
function u32f(fn: number, v: number): number[]  { return [...varint((fn << 3) | 0), ...varint(v)]; }
// string / bytes field (wire type 2)
function strf(fn: number, s: string): number[] {
  const b = Buffer.from(s, "utf8");
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}
function bytesf(fn: number, b: Buffer): number[] {
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}

// Wrap inner bytes in ProtoMessage + 4-byte BE length prefix
function buildFrame(payloadType: number, inner: number[]): Buffer {
  const innerBuf = Buffer.from(inner);
  const outer    = Buffer.from([...u32f(1, payloadType), ...bytesf(2, innerBuf)]);
  const out      = Buffer.alloc(4 + outer.length);
  out.writeUInt32BE(outer.length, 0);
  outer.copy(out, 4);
  return out;
}

// ── Minimal protobuf decoder ───────────────────────────────────────────────────
function readVarint(buf: Buffer, off: number): [number, number] {
  let v = 0, s = 0;
  while (off < buf.length) {
    const b = buf[off++];
    v |= (b & 0x7F) << s;
    s += 7;
    if (!(b & 0x80)) break;
  }
  return [v >>> 0, off];
}

interface PbField { fn: number; wt: number; v: number | Buffer }

function parseMsg(buf: Buffer): PbField[] {
  const out: PbField[] = [];
  let o = 0;
  while (o < buf.length) {
    let tag: number;
    [tag, o] = readVarint(buf, o);
    const fn = tag >>> 3, wt = tag & 7;
    if (wt === 0) {
      let v: number; [v, o] = readVarint(buf, o);
      out.push({ fn, wt, v });
    } else if (wt === 2) {
      let len: number; [len, o] = readVarint(buf, o);
      out.push({ fn, wt, v: buf.slice(o, o + len) });
      o += len;
    } else if (wt === 1) {
      o += 8;  // 64-bit fixed — skip
    } else if (wt === 5) {
      o += 4;  // 32-bit fixed — skip
    } else {
      break;   // unknown wire type — stop parsing
    }
  }
  return out;
}

function decodeFrame(buf: Buffer): { payloadType: number; payload: Buffer } | null {
  try {
    const fields  = parseMsg(buf);
    const ptField = fields.find(f => f.fn === 1 && f.wt === 0);
    const plField = fields.find(f => f.fn === 2 && f.wt === 2);
    if (!ptField) return null;
    return {
      payloadType: ptField.v as number,
      payload:     plField ? (plField.v as Buffer) : Buffer.alloc(0),
    };
  } catch { return null; }
}

// ── Typed message builders ─────────────────────────────────────────────────────
const mkAppAuthReq = (clientId: string, clientSecret: string) =>
  buildFrame(PT.APP_AUTH_REQ, [
    ...u32f(1, PT.APP_AUTH_REQ),
    ...strf(2, clientId),
    ...strf(3, clientSecret),
  ]);

const mkAcctAuthReq = (ctidTraderAccountId: number, accessToken: string) =>
  buildFrame(PT.ACCT_AUTH_REQ, [
    ...u32f(1, PT.ACCT_AUTH_REQ),
    ...u32f(2, ctidTraderAccountId),
    ...strf(3, accessToken),
  ]);

const mkSymbolListReq = (ctidTraderAccountId: number) =>
  buildFrame(PT.SYMBOL_LIST_REQ, [
    ...u32f(1, PT.SYMBOL_LIST_REQ),
    ...u32f(2, ctidTraderAccountId),
  ]);

const mkSymbolByIdReq = (ctidTraderAccountId: number, ids: number[]) =>
  buildFrame(PT.SYMBOL_BY_ID_REQ, [
    ...u32f(1, PT.SYMBOL_BY_ID_REQ),
    ...u32f(2, ctidTraderAccountId),
    ...ids.flatMap(id => u32f(3, id)),
  ]);

// ── Public interface ───────────────────────────────────────────────────────────
export interface CtraderSymbol {
  symbolId:    number;
  symbolName:  string;
  description: string;
  pipPosition: number;
  digits:      number;
}

export async function fetchSymbolsViaProtoOA(opts: {
  ctidTraderAccountId: number;
  isLive:              boolean;
  accessToken:         string;
  clientId:            string;
  clientSecret:        string;
  timeoutMs?:          number;
}): Promise<CtraderSymbol[]> {
  const {
    ctidTraderAccountId, isLive, accessToken,
    clientId, clientSecret, timeoutMs = 30_000,
  } = opts;

  const host = isLive ? LIVE_HOST : DEMO_HOST;
  const url  = `wss://${host}:${PORT}`;

  logger.info({ url, ctidTraderAccountId, isLive }, "ProtoOA: connecting…");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let recvBuf = Buffer.alloc(0);
    type Step = "app_auth" | "acct_auth" | "symbol_list" | "symbol_detail" | "done";
    let step: Step = "app_auth";
    let lightSymbols: Array<{ symbolId: number; symbolName: string; enabled: boolean }> = [];

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`ProtoOA timeout (${timeoutMs}ms) — stalled at step: ${step}`));
    }, timeoutMs);

    const finish = (result: CtraderSymbol[] | Error) => {
      clearTimeout(timer);
      step = "done";
      try { ws.terminate(); } catch { /* ignore */ }
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    // ── WebSocket events ──────────────────────────────────────────────────────
    ws.on("open", () => {
      logger.info({ url }, "ProtoOA: WebSocket connected ✓");
      ws.send(mkAppAuthReq(clientId, clientSecret));
      logger.info("ProtoOA: ApplicationAuthReq → sent");
    });

    ws.on("message", (data: Buffer) => {
      recvBuf = Buffer.concat([recvBuf, data]);
      // Consume all complete frames from the buffer
      while (recvBuf.length >= 4) {
        const msgLen = recvBuf.readUInt32BE(0);
        if (recvBuf.length < 4 + msgLen) break;
        const raw = recvBuf.slice(4, 4 + msgLen);
        recvBuf  = recvBuf.slice(4 + msgLen);
        const msg = decodeFrame(raw);
        if (msg) onMessage(msg);
      }
    });

    ws.on("error", err => {
      logger.error({ err }, "ProtoOA: WebSocket error");
      finish(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", (code, reason) => {
      if (step !== "done") {
        finish(new Error(`ProtoOA: connection closed at step=${step} code=${code} reason=${reason}`));
      }
    });

    // ── Message state machine ─────────────────────────────────────────────────
    function onMessage(msg: { payloadType: number; payload: Buffer }) {
      logger.info({ payloadType: msg.payloadType, step, payloadBytes: msg.payload.length }, "ProtoOA: ← received");

      // Handle errors from any step
      if (msg.payloadType === PT.ERROR_RES) {
        const f    = parseMsg(msg.payload);
        const code = f.find(x => x.fn === 2)?.v ?? "?";
        const dBuf = f.find(x => x.fn === 3 && x.wt === 2)?.v;
        const desc = dBuf ? (dBuf as Buffer).toString("utf8") : "unknown";
        logger.error({ errorCode: code, description: desc }, "ProtoOA: ERROR_RES received");
        finish(new Error(`ProtoOA error ${code}: ${desc}`));
        return;
      }

      switch (step) {
        case "app_auth": {
          if (msg.payloadType !== PT.APP_AUTH_RES) return;
          logger.info("ProtoOA: Application authorized ✓");
          step = "acct_auth";
          ws.send(mkAcctAuthReq(ctidTraderAccountId, accessToken));
          logger.info({ ctidTraderAccountId }, "ProtoOA: AccountAuthReq → sent");
          break;
        }

        case "acct_auth": {
          if (msg.payloadType !== PT.ACCT_AUTH_RES) return;
          logger.info({ ctidTraderAccountId }, "ProtoOA: Account authorized ✓");
          step = "symbol_list";
          ws.send(mkSymbolListReq(ctidTraderAccountId));
          logger.info("ProtoOA: SymbolsListReq → sent");
          break;
        }

        case "symbol_list": {
          if (msg.payloadType !== PT.SYMBOL_LIST_RES) return;

          const fields = parseMsg(msg.payload);
          lightSymbols = fields
            .filter(f => f.fn === 3 && f.wt === 2)
            .map(f => {
              const sf     = parseMsg(f.v as Buffer);
              const id     = sf.find(x => x.fn === 1 && x.wt === 0)?.v as number ?? 0;
              const namBuf = sf.find(x => x.fn === 2 && x.wt === 2)?.v;
              const en     = sf.find(x => x.fn === 3 && x.wt === 0)?.v as number ?? 1;
              return {
                symbolId:   id,
                symbolName: namBuf ? (namBuf as Buffer).toString("utf8") : `symbol_${id}`,
                enabled:    en !== 0,
              };
            });

          const enabled = lightSymbols.filter(s => s.enabled);
          logger.info(
            { total: lightSymbols.length, enabled: enabled.length },
            "ProtoOA: Symbols list received ✓",
          );

          if (enabled.length === 0) { finish([]); return; }

          // Fetch full details (digits + pipPosition) — cap at 1000 to limit request size
          const ids = enabled.slice(0, 1000).map(s => s.symbolId);
          step = "symbol_detail";
          ws.send(mkSymbolByIdReq(ctidTraderAccountId, ids));
          logger.info({ count: ids.length }, "ProtoOA: SymbolByIdReq → sent");
          break;
        }

        case "symbol_detail": {
          if (msg.payloadType !== PT.SYMBOL_BY_ID_RES) return;

          const fields     = parseMsg(msg.payload);
          const detailMap  = new Map<number, { digits: number; pipPosition: number }>();

          fields
            .filter(f => f.fn === 3 && f.wt === 2)
            .forEach(f => {
              const sf  = parseMsg(f.v as Buffer);
              const id  = sf.find(x => x.fn === 1 && x.wt === 0)?.v as number ?? 0;
              const dig = sf.find(x => x.fn === 2 && x.wt === 0)?.v as number ?? 5;
              const pip = sf.find(x => x.fn === 3 && x.wt === 0)?.v as number ?? 4;
              detailMap.set(id, { digits: dig, pipPosition: pip });
            });

          logger.info({ count: detailMap.size }, "ProtoOA: Symbol details received ✓");

          const result: CtraderSymbol[] = lightSymbols
            .filter(s => s.enabled)
            .slice(0, 1000)
            .map(s => {
              const d = detailMap.get(s.symbolId) ?? { digits: 5, pipPosition: 4 };
              return {
                symbolId:    s.symbolId,
                symbolName:  s.symbolName,
                description: s.symbolName,
                pipPosition: d.pipPosition,
                digits:      d.digits,
              };
            })
            .sort((a, b) => a.symbolName.localeCompare(b.symbolName));

          logger.info({ total: result.length }, "ProtoOA: Symbol merge complete ✓");
          finish(result);
          break;
        }

        default:
          // Heartbeats and other unsolicited messages — ignore silently
          break;
      }
    }
  });
}
