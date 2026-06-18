import WebSocket from "ws";
import { logger } from "./logger.js";

// ── ProtoOA WebSocket endpoints ────────────────────────────────────────────────
// Port 5035 = TLS/WSS ProtoOA endpoint (correct for both demo & live)
// Port 5036 is open but is a different service
const DEMO_HOST = "demo.ctraderapi.com";
const LIVE_HOST = "live.ctraderapi.com";
const PORT      = 5035;

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

// Known payload type names for logging
const PT_NAME: Record<number, string> = {
  2100: "APP_AUTH_REQ",   2101: "APP_AUTH_RES",
  2102: "ACCT_AUTH_REQ",  2103: "ACCT_AUTH_RES",
  2115: "SYMBOL_LIST_REQ", 2116: "SYMBOL_LIST_RES",
  2117: "SYMBOL_BY_ID_REQ", 2118: "SYMBOL_BY_ID_RES",
  2142: "ERROR_RES",
  51:   "HEARTBEAT_EVENT",
};

// ── Protobuf encoder ───────────────────────────────────────────────────────────
function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7F) { out.push((n & 0x7F) | 0x80); n >>>= 7; }
  out.push(n & 0x7F);
  return out;
}
function u32f(fn: number, v: number): number[]  { return [...varint((fn << 3) | 0), ...varint(v)]; }
function strf(fn: number, s: string): number[] {
  const b = Buffer.from(s, "utf8");
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}
function bytesf(fn: number, b: Buffer): number[] {
  return [...varint((fn << 3) | 2), ...varint(b.length), ...b];
}

// 4-byte BE length + ProtoMessage{payloadType(1), payload(2)}
function buildFrame(payloadType: number, inner: number[]): Buffer {
  const innerBuf = Buffer.from(inner);
  const outer    = Buffer.from([...u32f(1, payloadType), ...bytesf(2, innerBuf)]);
  const out      = Buffer.alloc(4 + outer.length);
  out.writeUInt32BE(outer.length, 0);
  outer.copy(out, 4);
  return out;
}

// ── Protobuf decoder ───────────────────────────────────────────────────────────
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

// ── Typed message builders ─────────────────────────────────────────────────────
function mkAppAuthReq(clientId: string, clientSecret: string): Buffer {
  // ProtoOAApplicationAuthReq: field1=payloadType, field2=clientId, field3=clientSecret
  return buildFrame(PT.APP_AUTH_REQ, [
    ...u32f(1, PT.APP_AUTH_REQ),
    ...strf(2, clientId),
    ...strf(3, clientSecret),
  ]);
}

function mkAcctAuthReq(ctidTraderAccountId: number, accessToken: string): Buffer {
  // ProtoOAAccountAuthReq: field1=payloadType, field2=ctidTraderAccountId, field3=accessToken
  return buildFrame(PT.ACCT_AUTH_REQ, [
    ...u32f(1, PT.ACCT_AUTH_REQ),
    ...u32f(2, ctidTraderAccountId),
    ...strf(3, accessToken),
  ]);
}

function mkSymbolListReq(ctidTraderAccountId: number): Buffer {
  // ProtoOASymbolsListReq: field1=payloadType, field2=ctidTraderAccountId
  return buildFrame(PT.SYMBOL_LIST_REQ, [
    ...u32f(1, PT.SYMBOL_LIST_REQ),
    ...u32f(2, ctidTraderAccountId),
  ]);
}

function mkSymbolByIdReq(ctidTraderAccountId: number, ids: number[]): Buffer {
  // ProtoOASymbolByIdReq: field1=payloadType, field2=ctidTraderAccountId, field3=symbolId(repeated)
  return buildFrame(PT.SYMBOL_BY_ID_REQ, [
    ...u32f(1, PT.SYMBOL_BY_ID_REQ),
    ...u32f(2, ctidTraderAccountId),
    ...ids.flatMap(id => u32f(3, id)),
  ]);
}

// ── Debug helpers ──────────────────────────────────────────────────────────────
function hexSnippet(buf: Buffer, maxBytes = 64): string {
  const slice = buf.slice(0, maxBytes);
  const hex   = slice.toString("hex").replace(/(.{2})/g, "$1 ").trim();
  return buf.length > maxBytes ? `${hex} … (${buf.length} bytes total)` : `${hex} (${buf.length} bytes)`;
}

function ptName(pt: number): string {
  return PT_NAME[pt] ? `${PT_NAME[pt]}(${pt})` : `UNKNOWN(${pt})`;
}

function parseErrorRes(payload: Buffer): { errorCode: number | string; description: string } {
  const fields = parseMsg(payload);
  const code   = fields.find(f => f.fn === 2 && f.wt === 0)?.v ?? "?";
  const descF  = fields.find(f => f.fn === 3 && f.wt === 2);
  const desc   = descF ? (descF.v as Buffer).toString("utf8") : "(no description)";
  return { errorCode: code as number | string, description: desc };
}

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

  // ── Credential sanity check ────────────────────────────────────────────────
  logger.info({
    url,
    ctidTraderAccountId,
    isLive,
    clientIdPresent:     !!clientId,
    clientIdLen:         clientId.length,
    clientIdPreview:     clientId.slice(0, 6) + "…",
    clientSecretPresent: !!clientSecret,
    clientSecretLen:     clientSecret.length,
    accessTokenLen:      accessToken.length,
    accessTokenPreview:  accessToken.slice(0, 12) + "…",
  }, "ProtoOA: initiating connection");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    let recvBuf = Buffer.alloc(0);
    type Step = "app_auth" | "acct_auth" | "symbol_list" | "symbol_detail" | "done";
    let step: Step = "app_auth";
    let lightSymbols: Array<{ symbolId: number; symbolName: string; enabled: boolean }> = [];

    const timer = setTimeout(() => {
      logger.error({ step, timeoutMs }, "ProtoOA: timeout — terminating");
      ws.terminate();
      reject(new Error(`ProtoOA timeout (${timeoutMs}ms) at step: ${step}`));
    }, timeoutMs);

    const finish = (result: CtraderSymbol[] | Error) => {
      clearTimeout(timer);
      step = "done";
      try { ws.terminate(); } catch { /* ignore */ }
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    // ── Send helper with hex logging ──────────────────────────────────────────
    function send(label: string, buf: Buffer) {
      logger.info({
        label,
        frameHex: hexSnippet(buf),
        totalBytes: buf.length,
        msgLen: buf.readUInt32BE(0),
      }, `ProtoOA: → SEND ${label}`);
      ws.send(buf);
    }

    // ── WebSocket events ──────────────────────────────────────────────────────
    ws.on("open", () => {
      logger.info({ url, port: PORT }, "ProtoOA: ✓ WebSocket OPEN");
      const frame = mkAppAuthReq(clientId, clientSecret);
      send("ApplicationAuthReq", frame);
    });

    ws.on("message", (data: Buffer) => {
      recvBuf = Buffer.concat([recvBuf, data]);

      // Log raw incoming bytes
      logger.info({
        rawHex: hexSnippet(data),
        totalBuffered: recvBuf.length,
      }, "ProtoOA: ← RAW incoming bytes");

      while (recvBuf.length >= 4) {
        const msgLen = recvBuf.readUInt32BE(0);
        if (recvBuf.length < 4 + msgLen) break;
        const raw    = recvBuf.slice(4, 4 + msgLen);
        recvBuf      = recvBuf.slice(4 + msgLen);

        logger.info({
          msgLen,
          rawHex: hexSnippet(raw),
        }, "ProtoOA: ← decoded frame (before ProtoMessage parse)");

        const msg = decodeFrame(raw);
        if (!msg) {
          logger.warn({ rawHex: hexSnippet(raw) }, "ProtoOA: failed to decode ProtoMessage — skipping");
          continue;
        }

        logger.info({
          payloadType: msg.payloadType,
          payloadTypeName: ptName(msg.payloadType),
          payloadLen:  msg.payload.length,
          payloadHex:  hexSnippet(msg.payload, 48),
          step,
        }, "ProtoOA: ← decoded message");

        onMessage(msg);
      }
    });

    ws.on("error", err => {
      logger.error({ err: String(err), step }, "ProtoOA: WebSocket ERROR event");
      finish(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : "(none)";
      logger.warn({
        code,
        reason: reasonStr,
        step,
        note: code === 1000 && reasonStr === "Bye"
          ? "Server closed cleanly — likely rejected ApplicationAuthReq. Check clientId/clientSecret and that they match the app registered on id.ctrader.com. Also verify the account is on the CORRECT environment (demo vs live)."
          : undefined,
      }, "ProtoOA: WebSocket CLOSE event");

      if (step !== "done") {
        finish(new Error(
          `ProtoOA: connection closed at step=${step} (code=${code}, reason="${reasonStr}")`
        ));
      }
    });

    // ── Message state machine ─────────────────────────────────────────────────
    function onMessage(msg: { payloadType: number; payload: Buffer }) {
      // ERROR_RES: log details before anything else
      if (msg.payloadType === PT.ERROR_RES) {
        const { errorCode, description } = parseErrorRes(msg.payload);
        logger.error({
          errorCode,
          description,
          payloadHex: hexSnippet(msg.payload),
          step,
        }, "ProtoOA: ✗ ERROR_RES received");
        finish(new Error(`ProtoOA ERROR_RES: code=${errorCode}, description=${description}`));
        return;
      }

      // Heartbeat — reply and continue
      if (msg.payloadType === 51) {
        logger.info("ProtoOA: heartbeat received — ignoring (no reply needed for WS)");
        return;
      }

      switch (step) {
        // ── Step 1: App auth ──────────────────────────────────────────────────
        case "app_auth": {
          if (msg.payloadType !== PT.APP_AUTH_RES) {
            logger.warn({
              unexpected: ptName(msg.payloadType),
              expected:   ptName(PT.APP_AUTH_RES),
            }, "ProtoOA: unexpected message while waiting for APP_AUTH_RES — ignoring");
            return;
          }
          logger.info("ProtoOA: ✓ ApplicationAuthRes — application authorized");
          step = "acct_auth";
          const frame = mkAcctAuthReq(ctidTraderAccountId, accessToken);
          send("AccountAuthReq", frame);
          break;
        }

        // ── Step 2: Account auth ──────────────────────────────────────────────
        case "acct_auth": {
          if (msg.payloadType !== PT.ACCT_AUTH_RES) {
            logger.warn({
              unexpected: ptName(msg.payloadType),
              expected:   ptName(PT.ACCT_AUTH_RES),
            }, "ProtoOA: unexpected message while waiting for ACCT_AUTH_RES — ignoring");
            return;
          }
          logger.info({ ctidTraderAccountId }, "ProtoOA: ✓ AccountAuthRes — account authorized");
          step = "symbol_list";
          const frame = mkSymbolListReq(ctidTraderAccountId);
          send("SymbolsListReq", frame);
          break;
        }

        // ── Step 3: Symbol list ───────────────────────────────────────────────
        case "symbol_list": {
          if (msg.payloadType !== PT.SYMBOL_LIST_RES) {
            logger.warn({ unexpected: ptName(msg.payloadType) }, "ProtoOA: unexpected during symbol_list — ignoring");
            return;
          }
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
                symbolName: namBuf ? (namBuf as Buffer).toString("utf8") : `sym_${id}`,
                enabled:    en !== 0,
              };
            });

          const enabled = lightSymbols.filter(s => s.enabled);
          logger.info({
            total:   lightSymbols.length,
            enabled: enabled.length,
            sample:  enabled.slice(0, 10).map(s => s.symbolName),
          }, "ProtoOA: ✓ SymbolListRes received");

          if (enabled.length === 0) { finish([]); return; }

          const ids = enabled.slice(0, 1000).map(s => s.symbolId);
          step = "symbol_detail";
          const frame = mkSymbolByIdReq(ctidTraderAccountId, ids);
          send(`SymbolByIdReq(${ids.length} symbols)`, frame);
          break;
        }

        // ── Step 4: Symbol details ────────────────────────────────────────────
        case "symbol_detail": {
          if (msg.payloadType !== PT.SYMBOL_BY_ID_RES) {
            logger.warn({ unexpected: ptName(msg.payloadType) }, "ProtoOA: unexpected during symbol_detail — ignoring");
            return;
          }
          const fields    = parseMsg(msg.payload);
          const detailMap = new Map<number, { digits: number; pipPosition: number }>();

          fields
            .filter(f => f.fn === 3 && f.wt === 2)
            .forEach(f => {
              const sf  = parseMsg(f.v as Buffer);
              const id  = sf.find(x => x.fn === 1 && x.wt === 0)?.v as number ?? 0;
              const dig = sf.find(x => x.fn === 2 && x.wt === 0)?.v as number ?? 5;
              const pip = sf.find(x => x.fn === 3 && x.wt === 0)?.v as number ?? 4;
              detailMap.set(id, { digits: dig, pipPosition: pip });
            });

          logger.info({ count: detailMap.size }, "ProtoOA: ✓ SymbolByIdRes received");

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

          logger.info({
            total:  result.length,
            sample: result.slice(0, 8).map(s => `${s.symbolName}(pip=${s.pipPosition},d=${s.digits})`),
          }, "ProtoOA: ✓ Symbol merge complete");

          finish(result);
          break;
        }

        default:
          logger.info({ payloadType: ptName(msg.payloadType), step }, "ProtoOA: ignoring message in step done");
          break;
      }
    }
  });
}
