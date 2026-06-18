import * as tls from "tls";
import { logger } from "./logger.js";

// ── ProtoOA TCP/TLS endpoints ──────────────────────────────────────────────────
// Official Spotware OpenAPI: raw TLS TCP socket (NOT WebSocket) on port 5035
// connect-js-adapter-tls uses tls.connect(port, host) — confirmed by connect-nodejs-samples
// Port 5035 also accepts a WebSocket HTTP-upgrade but immediately rejects ProtoOA inside WS frames.
// Raw TLS test: ApplicationAuthReq → APP_AUTH_RES (2101) confirmed working.
const DEMO_HOST = "demo.ctraderapi.com";
const LIVE_HOST = "live.ctraderapi.com";
const PORT      = 5035;

// ── Payload type IDs (from OpenApiMessages.proto) ─────────────────────────────
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

const PT_NAME: Record<number, string> = {
  2100: "APP_AUTH_REQ",    2101: "APP_AUTH_RES",
  2102: "ACCT_AUTH_REQ",   2103: "ACCT_AUTH_RES",
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

// Frame = [4-byte BE length][ProtoMessage{field1=payloadType(varint), field2=payload(bytes)}]
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

// ── Message builders ───────────────────────────────────────────────────────────
function mkAppAuthReq(clientId: string, clientSecret: string): Buffer {
  return buildFrame(PT.APP_AUTH_REQ, [
    ...u32f(1, PT.APP_AUTH_REQ),
    ...strf(2, clientId),
    ...strf(3, clientSecret),
  ]);
}

function mkAcctAuthReq(ctidTraderAccountId: number, accessToken: string): Buffer {
  return buildFrame(PT.ACCT_AUTH_REQ, [
    ...u32f(1, PT.ACCT_AUTH_REQ),
    ...u32f(2, ctidTraderAccountId),
    ...strf(3, accessToken),
  ]);
}

function mkSymbolListReq(ctidTraderAccountId: number): Buffer {
  return buildFrame(PT.SYMBOL_LIST_REQ, [
    ...u32f(1, PT.SYMBOL_LIST_REQ),
    ...u32f(2, ctidTraderAccountId),
  ]);
}

function mkSymbolByIdReq(ctidTraderAccountId: number, ids: number[]): Buffer {
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

function selfDecodeFrame(buf: Buffer): object {
  try {
    const msgLen      = buf.readUInt32BE(0);
    const outerFields = parseMsg(buf.slice(4, 4 + msgLen));
    const result: Record<string, unknown> = {
      frameTotalBytes: buf.length,
      innerMsgBytes:   msgLen,
    };
    for (const f of outerFields) {
      if (f.fn === 1 && f.wt === 0) {
        result["outer.field1.payloadType"] = `${f.v} (${ptName(f.v as number)})`;
      } else if (f.fn === 2 && f.wt === 2) {
        const inner = parseMsg(f.v as Buffer);
        const innerResult: Record<string, unknown> = {};
        for (const if_ of inner) {
          if (if_.wt === 0) {
            innerResult[`field${if_.fn}(varint)`] = if_.fn === 1
              ? `${if_.v} (${ptName(if_.v as number)})`
              : if_.v;
          } else if (if_.wt === 2) {
            const strVal = (if_.v as Buffer).toString("utf8");
            const hexVal = (if_.v as Buffer).toString("hex").replace(/(.{2})/g, "$1 ").trim();
            innerResult[`field${if_.fn}(string)`] = {
              utf8:     strVal,
              length:   (if_.v as Buffer).length,
              hexBytes: hexVal,
            };
          }
        }
        result["outer.field2.innerPayload"] = innerResult;
      }
    }
    return result;
  } catch (e) {
    return { decodeError: String(e) };
  }
}

// ── TLS connection helper ──────────────────────────────────────────────────────
// Creates a raw TLS TCP socket, streams data through the 4-byte length-prefixed
// framing decoder, and calls onFrame() for each complete ProtoMessage.
// Returns { write, destroy, onFrame, onConnect, onError, onClose }.
function makeTlsConn(host: string, port: number) {
  let recvBuf    = Buffer.alloc(0);
  let frameHandler: ((pt: number, payload: Buffer) => void) | null = null;
  let connectCb:  (() => void) | null = null;
  let errorCb:    ((e: Error) => void) | null = null;
  let closeCb:    ((hadError: boolean) => void) | null = null;

  const sock = tls.connect({ host, port, rejectUnauthorized: false }, () => {
    logger.info({ host, port, authorized: sock.authorized, cipher: sock.getCipher()?.name },
      "ProtoOA TLS: connected");
    connectCb?.();
  });

  sock.on("data", (chunk: Buffer) => {
    recvBuf = Buffer.concat([recvBuf, chunk]);
    logger.debug({ hex: hexSnippet(chunk, 32), bufLen: recvBuf.length }, "ProtoOA TLS: ← chunk");

    while (recvBuf.length >= 4) {
      const msgLen = recvBuf.readUInt32BE(0);
      if (msgLen === 0 || msgLen > 2_000_000) {
        logger.error({ msgLen, hex: hexSnippet(recvBuf, 16) }, "ProtoOA TLS: implausible msgLen — discarding buffer");
        recvBuf = Buffer.alloc(0);
        break;
      }
      if (recvBuf.length < 4 + msgLen) break;
      const raw = recvBuf.slice(4, 4 + msgLen);
      recvBuf   = recvBuf.slice(4 + msgLen);

      const msg = decodeFrame(raw);
      if (!msg) {
        logger.warn({ hex: hexSnippet(raw) }, "ProtoOA TLS: failed to decode frame — skipping");
        continue;
      }
      logger.info({
        payloadType: msg.payloadType,
        ptName:      ptName(msg.payloadType),
        payloadLen:  msg.payload.length,
        payloadHex:  hexSnippet(msg.payload, 48),
      }, `ProtoOA TLS: ← ${ptName(msg.payloadType)}`);

      frameHandler?.(msg.payloadType, msg.payload);
    }
  });

  sock.on("error", (e: Error) => {
    logger.error({ err: String(e) }, "ProtoOA TLS: socket error");
    errorCb?.(e);
  });

  sock.on("close", (hadError: boolean) => {
    logger.info({ hadError }, "ProtoOA TLS: socket closed");
    closeCb?.(hadError);
  });

  sock.on("end", () => {
    logger.info("ProtoOA TLS: server sent FIN (end)");
  });

  return {
    write: (label: string, buf: Buffer) => {
      logger.info({
        label,
        hex:       hexSnippet(buf, 96),
        bytes:     buf.length,
        selfDecode: selfDecodeFrame(buf),
      }, `ProtoOA TLS: → SEND ${label}`);
      sock.write(buf);
    },
    destroy: () => { try { sock.destroy(); } catch { /* ignore */ } },
    set onFrame(fn: (pt: number, payload: Buffer) => void) { frameHandler = fn; },
    set onConnect(fn: () => void)       { connectCb = fn; },
    set onError(fn: (e: Error) => void) { errorCb   = fn; },
    set onClose(fn: (hadError: boolean) => void) { closeCb = fn; },
  };
}

// ── probeAppAuth ───────────────────────────────────────────────────────────────
export interface AppAuthProbeResult {
  clientId:          string;
  clientIdHex:       string;
  mode:              string;
  success:           boolean;
  closeReason?:      string;
  errorCode?:        number | string;
  errorDescription?: string;
  receivedFrames:    Array<{ payloadType: number; ptName: string; payloadHex: string }>;
  durationMs:        number;
}

export async function probeAppAuth(opts: {
  clientId:     string;
  clientSecret: string;
  isLive?:      boolean;
  mode:         string;
  timeoutMs?:   number;
}): Promise<AppAuthProbeResult> {
  const { clientId, clientSecret, isLive = false, mode, timeoutMs = 14_000 } = opts;
  const host = isLive ? LIVE_HOST : DEMO_HOST;
  const t0   = Date.now();
  const receivedFrames: AppAuthProbeResult["receivedFrames"] = [];

  logger.info({
    mode, host, port: PORT,
    clientId: { value: clientId, length: clientId.length },
    transport: "raw TLS TCP (not WebSocket)",
  }, `ProtoOA probeAppAuth [Mode ${mode}]: starting`);

  return new Promise(resolve => {
    let settled = false;
    const conn  = makeTlsConn(host, PORT);
    const timer = setTimeout(() => finish({ success: false, closeReason: "local timeout" }), timeoutMs);

    function finish(partial: Partial<AppAuthProbeResult>) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.destroy();
      const result: AppAuthProbeResult = {
        clientId,
        clientIdHex: Buffer.from(clientId, "utf8").toString("hex").replace(/(.{2})/g, "$1 ").trim(),
        mode,
        success: false,
        receivedFrames,
        durationMs: Date.now() - t0,
        ...partial,
      };
      logger.info({
        mode, success: result.success, durationMs: result.durationMs,
        closeReason: result.closeReason, errorCode: result.errorCode,
        framesReceived: receivedFrames.length,
      }, `ProtoOA probeAppAuth [Mode ${mode}]: DONE`);
      resolve(result);
    }

    conn.onConnect = () => {
      conn.write("ApplicationAuthReq", mkAppAuthReq(clientId, clientSecret));
    };

    conn.onFrame = (pt, payload) => {
      receivedFrames.push({ payloadType: pt, ptName: ptName(pt), payloadHex: hexSnippet(payload, 48) });
      if (pt === PT.APP_AUTH_RES) {
        finish({ success: true });
      } else if (pt === PT.ERROR_RES) {
        const { errorCode, description } = parseErrorRes(payload);
        finish({ success: false, errorCode, errorDescription: description });
      }
    };

    conn.onError = (e) => finish({ success: false, closeReason: `socket_error: ${e.message}` });
    conn.onClose = (hadError) => finish({ success: false, closeReason: hadError ? "socket_error_close" : "remote_close" });
  });
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

  logger.info({
    host, port: PORT, ctidTraderAccountId, isLive,
    transport: "raw TLS TCP",
    clientIdLen: clientId.length,
    clientSecretLen: clientSecret.length,
    accessTokenLen: accessToken.length,
  }, "ProtoOA fetchSymbols: starting");

  return new Promise((resolve, reject) => {
    type Step = "app_auth" | "acct_auth" | "symbol_list" | "symbol_detail" | "done";
    let step: Step = "app_auth";
    let lightSymbols: Array<{ symbolId: number; symbolName: string; enabled: boolean }> = [];
    let settled = false;

    const conn  = makeTlsConn(host, PORT);
    const timer = setTimeout(() => {
      logger.error({ step, timeoutMs }, "ProtoOA fetchSymbols: timeout");
      finish(new Error(`ProtoOA timeout (${timeoutMs}ms) at step: ${step}`));
    }, timeoutMs);

    function finish(result: CtraderSymbol[] | Error) {
      if (settled) return;
      settled = true;
      step    = "done";
      clearTimeout(timer);
      conn.destroy();
      if (result instanceof Error) reject(result);
      else resolve(result);
    }

    conn.onConnect = () => {
      logger.info({ host, port: PORT }, "ProtoOA fetchSymbols: TLS connected — sending ApplicationAuthReq");
      conn.write("ApplicationAuthReq", mkAppAuthReq(clientId, clientSecret));
    };

    conn.onError = (e) => finish(e);

    conn.onClose = (hadError) => {
      if (step !== "done") {
        finish(new Error(`ProtoOA: connection closed at step=${step} (hadError=${hadError})`));
      }
    };

    conn.onFrame = (pt, payload) => {
      if (pt === PT.ERROR_RES) {
        const { errorCode, description } = parseErrorRes(payload);
        logger.error({ errorCode, description, step }, "ProtoOA fetchSymbols: ERROR_RES");
        finish(new Error(`ProtoOA ERROR_RES: code=${errorCode}, description=${description}`));
        return;
      }

      if (pt === 51) {
        logger.info("ProtoOA fetchSymbols: heartbeat");
        return;
      }

      switch (step) {
        case "app_auth": {
          if (pt !== PT.APP_AUTH_RES) {
            logger.warn({ got: ptName(pt), expected: ptName(PT.APP_AUTH_RES) }, "ProtoOA: unexpected frame in app_auth");
            return;
          }
          logger.info("ProtoOA fetchSymbols: ✓ APP_AUTH_RES — sending AccountAuthReq");
          step = "acct_auth";
          conn.write("AccountAuthReq", mkAcctAuthReq(ctidTraderAccountId, accessToken));
          break;
        }

        case "acct_auth": {
          if (pt !== PT.ACCT_AUTH_RES) {
            logger.warn({ got: ptName(pt), expected: ptName(PT.ACCT_AUTH_RES) }, "ProtoOA: unexpected frame in acct_auth");
            return;
          }
          logger.info({ ctidTraderAccountId }, "ProtoOA fetchSymbols: ✓ ACCT_AUTH_RES — sending SymbolsListReq");
          step = "symbol_list";
          conn.write("SymbolsListReq", mkSymbolListReq(ctidTraderAccountId));
          break;
        }

        case "symbol_list": {
          if (pt !== PT.SYMBOL_LIST_RES) {
            logger.warn({ got: ptName(pt) }, "ProtoOA: unexpected frame in symbol_list");
            return;
          }
          const fields = parseMsg(payload);
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
            total: lightSymbols.length, enabled: enabled.length,
            sample: enabled.slice(0, 10).map(s => s.symbolName),
          }, "ProtoOA fetchSymbols: ✓ SYMBOL_LIST_RES");

          if (enabled.length === 0) { finish([]); return; }

          const ids = enabled.slice(0, 1000).map(s => s.symbolId);
          step      = "symbol_detail";
          conn.write(`SymbolByIdReq(${ids.length})`, mkSymbolByIdReq(ctidTraderAccountId, ids));
          break;
        }

        case "symbol_detail": {
          if (pt !== PT.SYMBOL_BY_ID_RES) {
            logger.warn({ got: ptName(pt) }, "ProtoOA: unexpected frame in symbol_detail");
            return;
          }
          const fields    = parseMsg(payload);
          const detailMap = new Map<number, { digits: number; pipPosition: number }>();

          fields.filter(f => f.fn === 3 && f.wt === 2).forEach(f => {
            const sf  = parseMsg(f.v as Buffer);
            const id  = sf.find(x => x.fn === 1 && x.wt === 0)?.v as number ?? 0;
            const dig = sf.find(x => x.fn === 2 && x.wt === 0)?.v as number ?? 5;
            const pip = sf.find(x => x.fn === 3 && x.wt === 0)?.v as number ?? 4;
            detailMap.set(id, { digits: dig, pipPosition: pip });
          });

          logger.info({ count: detailMap.size }, "ProtoOA fetchSymbols: ✓ SYMBOL_BY_ID_RES");

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
          }, "ProtoOA fetchSymbols: ✓ symbol merge complete");

          finish(result);
          break;
        }
      }
    };
  });
}
