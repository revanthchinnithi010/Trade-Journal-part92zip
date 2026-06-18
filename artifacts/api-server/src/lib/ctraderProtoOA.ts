import WebSocket from "ws";
import { logger } from "./logger.js";

// ── ProtoOA WebSocket endpoints ────────────────────────────────────────────────
// Official Spotware OpenAPI docs: wss://{demo|live}.ctraderapi.com:5035
// Port 5035 = WSS ProtoOA (HTTP Upgrade + TLS)
// Port 5036 = different service (open but wrong)
const DEMO_HOST = "demo.ctraderapi.com";
const LIVE_HOST = "live.ctraderapi.com";
const PORT      = 5035;

// ── Payload type IDs (from OpenApiMessages.proto, confirmed) ──────────────────
// ProtoOAPayloadType enum values:
//   PROTO_OA_APPLICATION_AUTH_REQ = 2100
//   PROTO_OA_APPLICATION_AUTH_RES = 2101
//   PROTO_OA_ACCOUNT_AUTH_REQ     = 2102
//   PROTO_OA_ACCOUNT_AUTH_RES     = 2103
//   PROTO_OA_SYMBOLS_LIST_REQ     = 2115
//   PROTO_OA_SYMBOLS_LIST_RES     = 2116
//   PROTO_OA_SYMBOL_BY_ID_REQ     = 2117
//   PROTO_OA_SYMBOL_BY_ID_RES     = 2118
//   PROTO_OA_ERROR_RES            = 2142
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
// Proto2 wire format:
//   wire type 0 = varint  → tag = (field_number << 3) | 0
//   wire type 2 = length-delimited → tag = (field_number << 3) | 2
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
// ProtoOAApplicationAuthReq (official proto, confirmed):
//   optional ProtoOAPayloadType payloadType = 1 [default = PROTO_OA_APPLICATION_AUTH_REQ]
//   required string clientId = 2     ← "The unique Client ID provided during the registration"
//   required string clientSecret = 3 ← "The unique Client Secret provided during the registration"
function mkAppAuthReq(clientId: string, clientSecret: string): Buffer {
  return buildFrame(PT.APP_AUTH_REQ, [
    ...u32f(1, PT.APP_AUTH_REQ),
    ...strf(2, clientId),
    ...strf(3, clientSecret),
  ]);
}

// ProtoOAAccountAuthReq:
//   optional ProtoOAPayloadType payloadType = 1
//   required int64 ctidTraderAccountId = 2
//   required string accessToken = 3
function mkAcctAuthReq(ctidTraderAccountId: number, accessToken: string): Buffer {
  return buildFrame(PT.ACCT_AUTH_REQ, [
    ...u32f(1, PT.ACCT_AUTH_REQ),
    ...u32f(2, ctidTraderAccountId),
    ...strf(3, accessToken),
  ]);
}

// ProtoOASymbolsListReq:
//   optional ProtoOAPayloadType payloadType = 1
//   required int64 ctidTraderAccountId = 2
function mkSymbolListReq(ctidTraderAccountId: number): Buffer {
  return buildFrame(PT.SYMBOL_LIST_REQ, [
    ...u32f(1, PT.SYMBOL_LIST_REQ),
    ...u32f(2, ctidTraderAccountId),
  ]);
}

// ProtoOASymbolByIdReq:
//   optional ProtoOAPayloadType payloadType = 1
//   required int64 ctidTraderAccountId = 2
//   repeated int64 symbolId = 3
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

// Decode a built frame back to human-readable fields (pre-send self-check)
function selfDecodeFrame(buf: Buffer): object {
  try {
    const msgLen     = buf.readUInt32BE(0);
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
              utf8:    strVal,
              length:  (if_.v as Buffer).length,
              hexBytes: hexVal,
            };
          }
        }
        result["inner(ProtoOAApplicationAuthReq)"] = innerResult;
      }
    }
    return result;
  } catch (e) {
    return { decodeError: String(e) };
  }
}

// Inspect a string for hidden characters (whitespace, BOM, newlines, etc.)
function inspectString(label: string, s: string): object {
  const buf       = Buffer.from(s, "utf8");
  const trimmed   = s.trim();
  const charCodes = Array.from(s.slice(0, 20)).map(c => c.charCodeAt(0));
  return {
    label,
    length:         s.length,
    trimmedLength:  trimmed.length,
    hasPadding:     s !== trimmed,
    startsWithBOM:  buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF,
    first6chars:    s.slice(0, 6),
    last4chars:     s.slice(-4),
    first20charCodes: charCodes,
    hexFirst20bytes: buf.slice(0, 20).toString("hex").replace(/(.{2})/g, "$1 ").trim(),
  };
}

// ── probeAppAuth — test a single clientId and return pass/fail ────────────────
// Official Spotware clientId format (from connect-nodejs-samples):
//   '7_5az7pj935owsss8kgokcco84wc8osk0g0gksow0ow4s4ocwwgc'
//   → format: "{numericAppId}_{longAlphanumericString}"
//   → NOT just the numeric app ID alone
export interface AppAuthProbeResult {
  clientId:         string;
  clientIdHex:      string;
  mode:             string;
  success:          boolean;
  closeCode?:       number;
  closeReason?:     string;
  errorCode?:       number | string;
  errorDescription?: string;
  receivedMessages: Array<{ payloadType: number; payloadTypeName: string; payloadHex: string }>;
  allRawBytesHex:   string;   // every byte the server sent before close
  durationMs:       number;
}

export async function probeAppAuth(opts: {
  clientId:     string;
  clientSecret: string;
  isLive?:      boolean;
  mode:         string;         // label for logs ("A" | "B" | etc.)
  timeoutMs?:   number;
}): Promise<AppAuthProbeResult> {
  const { clientId, clientSecret, isLive = false, mode, timeoutMs = 12_000 } = opts;
  const host = isLive ? LIVE_HOST : DEMO_HOST;
  const url  = `wss://${host}:${PORT}`;
  const t0   = Date.now();

  logger.info({
    mode,
    url,
    clientId: {
      value:   clientId,
      length:  clientId.length,
      hexBytes: Buffer.from(clientId, "utf8").toString("hex").replace(/(.{2})/g, "$1 ").trim(),
    },
    note: "Official format: '{appId}_{longAlphanumeric}' e.g. '26547_abc123xyz...'",
  }, `ProtoOA probeAppAuth [Mode ${mode}]: attempting ApplicationAuthReq`);

  return new Promise(resolve => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    let recvBuf       = Buffer.alloc(0);
    let allRawBytes   = Buffer.alloc(0);
    const receivedMessages: AppAuthProbeResult["receivedMessages"] = [];
    let settled       = false;

    const finish = (partial: Omit<AppAuthProbeResult, "clientId"|"clientIdHex"|"mode"|"allRawBytesHex"|"receivedMessages"|"durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch { /* ignore */ }
      const result: AppAuthProbeResult = {
        clientId,
        clientIdHex: Buffer.from(clientId, "utf8").toString("hex").replace(/(.{2})/g, "$1 ").trim(),
        mode,
        allRawBytesHex: allRawBytes.toString("hex").replace(/(.{2})/g, "$1 ").trim(),
        receivedMessages,
        durationMs: Date.now() - t0,
        ...partial,
      };
      logger.info({
        mode, success: result.success, closeCode: result.closeCode,
        closeReason: result.closeReason, errorCode: result.errorCode,
        errorDescription: result.errorDescription,
        messagesReceived: receivedMessages.length,
        rawBytesFromServer: allRawBytes.length,
        durationMs: result.durationMs,
      }, `ProtoOA probeAppAuth [Mode ${mode}]: DONE`);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ success: false, closeReason: "local timeout" });
    }, timeoutMs);

    ws.on("open", () => {
      const frame = mkAppAuthReq(clientId, clientSecret);
      logger.info({
        mode,
        selfDecode: selfDecodeFrame(frame),
      }, `ProtoOA probeAppAuth [Mode ${mode}]: WS open — sending ApplicationAuthReq`);
      ws.send(frame);
    });

    ws.on("message", (data: Buffer) => {
      allRawBytes = Buffer.concat([allRawBytes, data]);
      recvBuf     = Buffer.concat([recvBuf, data]);

      logger.info({
        mode,
        rawHex:    hexSnippet(data, 128),
        chunkBytes: data.length,
      }, `ProtoOA probeAppAuth [Mode ${mode}]: ← RAW chunk`);

      while (recvBuf.length >= 4) {
        const msgLen = recvBuf.readUInt32BE(0);
        if (msgLen > 1_000_000 || recvBuf.length < 4 + msgLen) break;
        const raw = recvBuf.slice(4, 4 + msgLen);
        recvBuf   = recvBuf.slice(4 + msgLen);

        const msg = decodeFrame(raw);
        if (!msg) {
          logger.warn({ mode, rawHex: hexSnippet(raw) }, `ProtoOA probeAppAuth [Mode ${mode}]: ← undecoded frame`);
          continue;
        }

        receivedMessages.push({
          payloadType:     msg.payloadType,
          payloadTypeName: ptName(msg.payloadType),
          payloadHex:      hexSnippet(msg.payload, 64),
        });

        logger.info({
          mode,
          payloadType:     msg.payloadType,
          payloadTypeName: ptName(msg.payloadType),
          payloadLen:      msg.payload.length,
          payloadHex:      hexSnippet(msg.payload, 64),
        }, `ProtoOA probeAppAuth [Mode ${mode}]: ← ${ptName(msg.payloadType)}`);

        if (msg.payloadType === PT.APP_AUTH_RES) {
          finish({ success: true });
          return;
        }
        if (msg.payloadType === PT.ERROR_RES) {
          const { errorCode, description } = parseErrorRes(msg.payload);
          finish({ success: false, errorCode, errorDescription: description });
          return;
        }
      }
    });

    ws.on("error", err => {
      logger.error({ mode, err: String(err) }, `ProtoOA probeAppAuth [Mode ${mode}]: WS error`);
      finish({ success: false, closeReason: `ws_error: ${String(err)}` });
    });

    ws.on("close", (code, reason) => {
      const reasonStr = reason?.toString() ?? "(none)";
      logger.warn({
        mode, code, reason: reasonStr,
        allRawBytes: allRawBytes.length,
        messagesBeforeClose: receivedMessages.length,
      }, `ProtoOA probeAppAuth [Mode ${mode}]: WS CLOSE`);
      finish({ success: false, closeCode: code, closeReason: reasonStr });
    });
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
  const url  = `wss://${host}:${PORT}`;

  // ── Credential byte-level inspection (catches hidden chars, BOM, newlines) ──
  logger.info({
    url,
    port: PORT,
    ctidTraderAccountId,
    isLive,
    clientId:     inspectString("CTRADER_CLIENT_ID",     clientId),
    clientSecret: inspectString("CTRADER_CLIENT_SECRET", clientSecret),
    accessToken:  inspectString("accessToken",           accessToken),
    protoSchema: {
      "ProtoOAApplicationAuthReq.field2": "string clientId  (= Client ID from id.ctrader.com)",
      "ProtoOAApplicationAuthReq.field3": "string clientSecret",
      note: "clientId is the string shown as 'Client ID' in the cTrader Open API portal, e.g. '12345' or a UUID",
    },
  }, "ProtoOA: CREDENTIAL INSPECTION — check for hidden chars, wrong length, padding");

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

    // ── Send helper: logs frame hex + self-decoded fields ─────────────────────
    function send(label: string, buf: Buffer) {
      logger.info({
        label,
        fullFrameHex:  hexSnippet(buf, 128),
        totalBytes:    buf.length,
        msgLen:        buf.readUInt32BE(0),
        selfDecode:    selfDecodeFrame(buf),
      }, `ProtoOA: → SEND ${label}`);
      ws.send(buf);
    }

    // ── WebSocket open ────────────────────────────────────────────────────────
    ws.on("open", () => {
      logger.info({ url, port: PORT }, "ProtoOA: ✓ WebSocket OPEN");

      // Build the ApplicationAuthReq
      const frame = mkAppAuthReq(clientId, clientSecret);

      // Log exact values being encoded into the message
      logger.info({
        messageType: "ProtoOAApplicationAuthReq",
        payloadType: `${PT.APP_AUTH_REQ} (PROTO_OA_APPLICATION_AUTH_REQ)`,
        "field2.clientId": {
          value:   clientId,
          length:  clientId.length,
          hexBytes: Buffer.from(clientId, "utf8").toString("hex").replace(/(.{2})/g, "$1 ").trim(),
        },
        "field3.clientSecret": {
          length:         clientSecret.length,
          first4hexBytes: Buffer.from(clientSecret, "utf8").slice(0, 4).toString("hex").replace(/(.{2})/g, "$1 ").trim(),
          last4hexBytes:  Buffer.from(clientSecret, "utf8").slice(-4).toString("hex").replace(/(.{2})/g, "$1 ").trim(),
        },
      }, "ProtoOA: EXACT PAYLOAD BEING SENT — verify field values match cTrader portal");

      send("ApplicationAuthReq", frame);
    });

    // ── Incoming messages ─────────────────────────────────────────────────────
    ws.on("message", (data: Buffer) => {
      recvBuf = Buffer.concat([recvBuf, data]);

      logger.info({
        rawHex:        hexSnippet(data, 128),
        chunkBytes:    data.length,
        totalBuffered: recvBuf.length,
        step,
      }, "ProtoOA: ← RAW chunk received");

      while (recvBuf.length >= 4) {
        const msgLen = recvBuf.readUInt32BE(0);

        // Guard against corrupt length prefix
        if (msgLen > 1_000_000) {
          logger.error({ msgLen, rawHex: hexSnippet(recvBuf, 32) }, "ProtoOA: implausible msgLen — possible non-ProtoOA data");
          break;
        }

        if (recvBuf.length < 4 + msgLen) break;
        const raw    = recvBuf.slice(4, 4 + msgLen);
        recvBuf      = recvBuf.slice(4 + msgLen);

        logger.info({
          msgLen,
          rawPayloadHex: hexSnippet(raw, 64),
        }, "ProtoOA: ← decoded length-prefixed frame");

        const msg = decodeFrame(raw);
        if (!msg) {
          logger.warn({ rawHex: hexSnippet(raw) }, "ProtoOA: ✗ failed to parse ProtoMessage — skipping");
          continue;
        }

        logger.info({
          payloadType:     msg.payloadType,
          payloadTypeName: ptName(msg.payloadType),
          payloadLen:      msg.payload.length,
          payloadHex:      hexSnippet(msg.payload, 64),
          step,
        }, `ProtoOA: ← ${ptName(msg.payloadType)}`);

        onMessage(msg);
      }
    });

    // ── WS errors ─────────────────────────────────────────────────────────────
    ws.on("error", err => {
      logger.error({ err: String(err), step }, "ProtoOA: WebSocket ERROR event");
      finish(err instanceof Error ? err : new Error(String(err)));
    });

    // ── WS close ──────────────────────────────────────────────────────────────
    ws.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : "(none)";
      const isByeBye  = code === 1000 && reasonStr === "Bye";

      logger.warn({
        code,
        reason: reasonStr,
        step,
        diagnosis: isByeBye
          ? [
              "Server deliberately closed after receiving ApplicationAuthReq.",
              "This means: (1) clientId or clientSecret does not match what is registered",
              "            on https://id.ctrader.com/account/applications",
              "            (2) OR the app Environment=Demo but account is Live (or vice versa)",
              "Check the selfDecode log above — verify field2(clientId) and field3(clientSecret)",
              "match EXACTLY the values shown in the cTrader portal (no spaces, no newlines).",
            ]
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

      if (msg.payloadType === 51) {
        logger.info("ProtoOA: heartbeat received");
        return;
      }

      switch (step) {
        case "app_auth": {
          if (msg.payloadType !== PT.APP_AUTH_RES) {
            logger.warn({ unexpected: ptName(msg.payloadType), expected: ptName(PT.APP_AUTH_RES) },
              "ProtoOA: unexpected message while waiting for APP_AUTH_RES — ignoring");
            return;
          }
          logger.info("ProtoOA: ✓ ApplicationAuthRes — application authorized");
          step = "acct_auth";
          send("AccountAuthReq", mkAcctAuthReq(ctidTraderAccountId, accessToken));
          break;
        }

        case "acct_auth": {
          if (msg.payloadType !== PT.ACCT_AUTH_RES) {
            logger.warn({ unexpected: ptName(msg.payloadType), expected: ptName(PT.ACCT_AUTH_RES) },
              "ProtoOA: unexpected message while waiting for ACCT_AUTH_RES — ignoring");
            return;
          }
          logger.info({ ctidTraderAccountId }, "ProtoOA: ✓ AccountAuthRes — account authorized");
          step = "symbol_list";
          send("SymbolsListReq", mkSymbolListReq(ctidTraderAccountId));
          break;
        }

        case "symbol_list": {
          if (msg.payloadType !== PT.SYMBOL_LIST_RES) {
            logger.warn({ unexpected: ptName(msg.payloadType) }, "ProtoOA: unexpected during symbol_list — ignoring");
            return;
          }
          const fields = parseMsg(msg.payload);
          lightSymbols = fields
            .filter(f => f.fn === 3 && f.wt === 2)
            .map(f => {
              const sf    = parseMsg(f.v as Buffer);
              const id    = sf.find(x => x.fn === 1 && x.wt === 0)?.v as number ?? 0;
              const namBuf = sf.find(x => x.fn === 2 && x.wt === 2)?.v;
              const en    = sf.find(x => x.fn === 3 && x.wt === 0)?.v as number ?? 1;
              return {
                symbolId:   id,
                symbolName: namBuf ? (namBuf as Buffer).toString("utf8") : `sym_${id}`,
                enabled:    en !== 0,
              };
            });

          const enabled = lightSymbols.filter(s => s.enabled);
          logger.info({ total: lightSymbols.length, enabled: enabled.length,
            sample: enabled.slice(0, 10).map(s => s.symbolName),
          }, "ProtoOA: ✓ SymbolListRes received");

          if (enabled.length === 0) { finish([]); return; }

          const ids = enabled.slice(0, 1000).map(s => s.symbolId);
          step = "symbol_detail";
          send(`SymbolByIdReq(${ids.length} symbols)`, mkSymbolByIdReq(ctidTraderAccountId, ids));
          break;
        }

        case "symbol_detail": {
          if (msg.payloadType !== PT.SYMBOL_BY_ID_RES) {
            logger.warn({ unexpected: ptName(msg.payloadType) }, "ProtoOA: unexpected during symbol_detail — ignoring");
            return;
          }
          const fields    = parseMsg(msg.payload);
          const detailMap = new Map<number, { digits: number; pipPosition: number }>();

          fields.filter(f => f.fn === 3 && f.wt === 2).forEach(f => {
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
          break;
      }
    }
  });
}
