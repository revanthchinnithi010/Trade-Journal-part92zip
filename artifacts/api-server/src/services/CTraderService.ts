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
  private lastStuckStep: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stepTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private hbSentAt = 0;
  latencyMs = 0;

  // ── Endpoint auto-probe ───────────────────────────────────────────────────
  // When APP_AUTH returns "Corrupted frame", the app may be registered on the
  // OTHER endpoint (live vs. demo).  We automatically try the alternate once
  // before surfacing a credential error to the user.
  //   0 = use primary endpoint (from CTRADER_ENV, default "live")
  //   1 = use alternate endpoint (flipped from primary)
  private endpointProbe: 0 | 1 = 0;
  private activeEndpointEnv: "live" | "demo" = "live";  // tracks what's currently in use
  // When APP_AUTH succeeds on DEMO but accounts are LIVE, we try upgrading to
  // the LIVE endpoint for account auth.  This flag prevents an infinite loop.
  private liveEndpointUpgradeAttempted = false;
  // Set to true before an intentional socket.destroy() so onDisconnected() does
  // not falsely report "Connection closed by server during <state>".
  private intentionalDisconnect = false;
  // ─────────────────────────────────────────────────────────────────────────

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private preferredAccountId: string | null = null;

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
    const params: Record<string, string> = {
      client_id: id, redirect_uri: redirectUri,
      scope: "trading", response_type: "code",
    };
    if (state) params["state"] = state;
    return `https://connect.spotware.com/apps/auth?${new URLSearchParams(params)}`;
  }

  async createOAuthState(): Promise<string> {
    await this.ensureOAuthStateTable();
    const state = randomUUID();
    await pool.query("INSERT INTO ctrader_oauth_state (state) VALUES ($1)", [state]);
    await pool.query("DELETE FROM ctrader_oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'");
    return state;
  }

  async validateOAuthState(state: string): Promise<boolean> {
    const r = await pool.query(
      "DELETE FROM ctrader_oauth_state WHERE state = $1 RETURNING state", [state],
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

    const accessToken = String(res["access_token"]);
    const refreshToken = String(res["refresh_token"] ?? "");
    const expiresIn = Number(res["expires_in"] ?? 3600);
    logger.info({
      accessTokenPrefix: accessToken.slice(0, 8) + "…",
      expiresIn, hasRefreshToken: !!refreshToken,
    }, "CTraderService: OAuth tokens received — storing and connecting");

    await this.connectWithToken(accessToken, null, { refreshToken, expiresIn });
  }

  // ── Token connect ─────────────────────────────────────────────────────────

  async connectWithToken(
    accessToken: string,
    accountId: string | null,
    opts?: { refreshToken?: string; expiresIn?: number },
  ): Promise<void> {
    this.accessToken = accessToken;
    this.preferredAccountId = accountId;
    this.refreshToken = opts?.refreshToken ?? null;
    this.tokenExpiresAt = opts?.expiresIn
      ? new Date(Date.now() + opts.expiresIn * 1000)
      : null;
    await this.saveToken();

    // Upsert into broker_accounts so the frontend loadAccounts() can find it
    const existing = await pool.query("SELECT id FROM broker_accounts WHERE broker_id = 'ctrader'");
    if (existing.rows.length > 0) {
      BrokerService.evict(existing.rows[0].id as number);
      await pool.query(
        "UPDATE broker_accounts SET api_key_enc=$1, api_secret_enc=$2, api_token=$3, is_active=true WHERE broker_id='ctrader'",
        [encrypt(accessToken), encrypt(accountId ?? "pending"), accessToken],
      );
    } else {
      await pool.query(
        `INSERT INTO broker_accounts (broker_id, label, api_key_enc, api_secret_enc, api_token, is_active)
         VALUES ('ctrader', 'cTrader', $1, $2, $3, true)`,
        [encrypt(accessToken), encrypt(accountId ?? "pending"), accessToken],
      );
    }

    // Tear down stale socket before reconnect
    if (this.socket) {
      this.intentionalDisconnect = true;
      this.socket.destroy();
      this.socket = null;
    }
    this.clearTimers();
    this.lastError = null;
    this.lastStuckStep = null;
    this.endpointProbe = 0;
    this.liveEndpointUpgradeAttempted = false;
    this.state = "disconnected";
    logger.info({ hasToken: true }, "CTraderService: connectWithToken — calling connect()");
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

  // ── Step timeout ─────────────────────────────────────────────────────────

  private setStepTimeout(stepLabel: string, ms = 30_000): void {
    this.clearStepTimeout();
    this.stepTimeoutTimer = setTimeout(() => {
      this.stepTimeoutTimer = null;
      const msg = `No response after ${ms / 1000}s waiting for: ${stepLabel}`;
      logger.error({ stepLabel, stateAtTimeout: this.state }, `CTraderService: step timed out — ${msg}`);
      this.lastStuckStep = stepLabel;
      this.lastError = msg;
      this.state = "error";
      this.emit("status_change", this.getStatus());
    }, ms);
  }

  private clearStepTimeout(): void {
    if (this.stepTimeoutTimer) { clearTimeout(this.stepTimeoutTimer); this.stepTimeoutTimer = null; }
  }

  // ── TLS connect ───────────────────────────────────────────────────────────

  private connect(): void {
    if (this.state !== "disconnected" && this.state !== "error") return;
    this.clearTimers();
    // Destroy any stale socket defensively — its lingering 'close' event would
    // call onDisconnected() mid-auth and corrupt the new connection's state.
    if (this.socket) {
      this.intentionalDisconnect = true;
      this.socket.destroy();
      this.socket = null;
    }
    this.state = "connecting";
    this.rxBuf = Buffer.alloc(0);

    // Configurable endpoint: CTRADER_ENV=demo uses demo.ctraderapi.com:5035.
    // Auto-probe: if APP_AUTH returns "Corrupted frame" we flip to the alternate
    // endpoint automatically (endpointProbe=1) before reporting a credential error.
    const primaryEnv = (process.env["CTRADER_ENV"] ?? "live").toLowerCase() as "live" | "demo";
    const env: "live" | "demo" = this.endpointProbe === 0
      ? primaryEnv
      : (primaryEnv === "live" ? "demo" : "live");
    this.activeEndpointEnv = env;
    const host = process.env["CTRADER_API_HOST"] ?? (env === "demo" ? "demo.ctraderapi.com" : "live.ctraderapi.com");
    const port = Number(process.env["CTRADER_API_PORT"] ?? (env === "demo" ? "5035" : "5036"));

    // ── Diagnostic: credential and token status ──────────────────────────────
    const clientId     = process.env["CTRADER_CLIENT_ID"]     ?? "";
    const clientSecret = process.env["CTRADER_CLIENT_SECRET"] ?? "";
    logger.info({
      "[1] clientIdLoaded":     clientId.length > 0,
      "[1] clientIdLength":     clientId.length,
      "[2] clientSecretLoaded": clientSecret.length > 0,
      "[2] clientSecretLength": clientSecret.length,
      "[3] oauthTokenLoaded":   !!(this.accessToken),
      "[3] oauthTokenLength":   this.accessToken?.length ?? 0,
      "[3] oauthTokenPrefix":   this.accessToken ? this.accessToken.slice(0, 12) + "…" : "(none)",
      "[4] endpoint":           `tls://${host}:${port}`,
      "[4] env":                env,
    }, "CTraderService [DIAG] connection attempt — credential & endpoint status");

    if (!clientId)     logger.error("CTraderService [DIAG] CTRADER_CLIENT_ID is EMPTY — App Auth will fail");
    if (!clientSecret) logger.error("CTraderService [DIAG] CTRADER_CLIENT_SECRET is EMPTY — App Auth will fail");
    if (!this.accessToken) logger.error("CTraderService [DIAG] OAuth access token is missing — Get Accounts will fail");
    // ────────────────────────────────────────────────────────────────────────

    this.setStepTimeout("TLS handshake / connect");

    const sock = tls.connect({ host, port, rejectUnauthorized: true });
    this.socket = sock;

    sock.on("secureConnect", () => {
      this.clearStepTimeout();
      logger.info({
        "[4] endpoint": `tls://${host}:${port}`,
        authorized: sock.authorized,
        cipher: sock.getCipher?.()?.name ?? "unknown",
      }, "CTraderService: TLS connected — sending App Auth request");
      this.state = "app_auth";
      this.sendAppAuth();
      this.startHeartbeat();
    });

    sock.on("data", (chunk: Buffer) => {
      // Log raw bytes during early auth states to catch any server message before close
      if (this.state === "app_auth" || this.state === "get_accounts") {
        logger.info({
          "[7] state":    this.state,
          "[7] rawBytes": chunk.length,
          "[7] rawHex":   chunk.toString("hex").slice(0, 128) + (chunk.length > 64 ? "…" : ""),
        }, "CTraderService [DIAG] raw data received from server");
      }
      this.onData(chunk);
    });

    sock.on("close", (hadError: boolean) => {
      // Skip diagnostic logging for intentional teardowns (endpoint probe / live upgrade).
      if (this.intentionalDisconnect) {
        this.onDisconnected();
        return;
      }
      const closeInfo = {
        "[6] hadError":       hadError,
        "[6] stateAtClose":   this.state,
        "[6] authorized":     sock.authorized,
        "[6] authError":      (sock as unknown as { authorizationError?: string }).authorizationError ?? null,
        "[7] closeReason":    hadError
          ? "socket closed with error — see preceding error event"
          : "server closed connection cleanly (no error flag)",
      };
      if (hadError || ["app_auth","get_accounts","account_auth","fetch_symbols","fetch_symbol_details"].includes(this.state)) {
        logger.error(closeInfo, "CTraderService [DIAG] socket closed during auth flow");
      } else {
        logger.warn(closeInfo, "CTraderService: socket closed");
      }
      this.onDisconnected();
    });

    sock.on("error", (err) => {
      this.clearStepTimeout();
      logger.error({
        "[6] err":          err.message,
        "[6] code":         (err as NodeJS.ErrnoException).code ?? null,
        "[7] closeReason":  err.message,
        "[4] endpoint":     `tls://${host}:${port}`,
      }, "CTraderService [DIAG] socket error");
      this.lastError = `TLS connection failed: ${err.message}`;
      this.lastStuckStep = "TLS connect";
      this.onDisconnected();
    });
  }

  private onDisconnected(): void {
    this.clearTimers();
    // If this was an intentional socket teardown (endpoint probe / live upgrade),
    // skip the error reporting — the caller schedules the next connect() itself.
    if (this.intentionalDisconnect) {
      this.intentionalDisconnect = false;
      return;
    }
    const wasConnected = this.state === "subscribed";
    // If the socket closed while we were mid-auth-flow and there's no error yet,
    // it means cTrader rejected the connection (wrong credentials / error before ERROR_RES arrived).
    const midAuthStates: State[] = ["app_auth", "get_accounts", "account_auth", "fetch_symbols", "fetch_symbol_details"];
    if (midAuthStates.includes(this.state) && !this.lastError) {
      const stateLabel = this.state;
      const msg = `Connection closed by server during ${stateLabel}. ` +
        "Check CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET — credentials may be invalid or app not approved.";
      logger.error({ stateAtClose: stateLabel }, `CTraderService: ${msg}`);
      this.lastError = msg;
      this.lastStuckStep = stateLabel;
      this.state = "error";
      this.symbolIds.clear();
      this.symbolMeta.clear();
      this.emit("status_change", this.getStatus());
      // Do NOT auto-reconnect for credential errors — user must re-authenticate
      return;
    }
    // Do not auto-reconnect if there's a permanent credential/config error.
    // Keep state as "error" so the UI can show the actionable error card.
    if (this.lastError) {
      logger.warn("CTraderService: permanent error — not auto-reconnecting");
      this.state = "error";
      this.symbolIds.clear();
      this.symbolMeta.clear();
      this.emit("status_change", this.getStatus());
      return;
    }
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

    // ── JSON fallback ────────────────────────────────────────────────────────
    // cTrader sends plain-JSON responses for certain errors (e.g. invalid/empty
    // client credentials).  The binary parser would silently discard these
    // because 0x7b22 ("{}") looks like a 2 GB length prefix.  Detect and
    // handle JSON messages here before attempting binary framing.
    if (this.rxBuf.length > 0 && this.rxBuf[0] === 0x7b /* '{' */) {
      const text = this.rxBuf.toString("utf8");
      // Wait until we have a complete JSON object (ends with '}')
      if (text.trimEnd().endsWith("}")) {
        try {
          const msg = JSON.parse(text) as {
            payloadType?: number;
            payload?: Record<string, unknown>;
            clientMsgId?: string;
          };
          logger.info({
            "[7] format":      "JSON (not binary protobuf)",
            "[7] payloadType": msg.payloadType,
            "[7] payload":     msg.payload,
          }, "CTraderService [DIAG] JSON message received from server");

          if (msg.payloadType === PT.ERROR_RES) {
            const p        = (msg.payload ?? {}) as Record<string, unknown>;
            const errCode  = (p["errorCode"]  as string) ?? "UNKNOWN";
            const desc     = (p["description"] as string ?? p["errorDescription"] as string) ?? "";
            const detail   = desc ? `${errCode} — ${desc}` : errCode;
            let finalMsg   = `cTrader server error: ${detail}. Verify CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET match your Open API app.`;
            logger.error({
              "[7] errCode": errCode,
              "[7] desc":    desc,
              "[7] endpointProbe": this.endpointProbe,
              "[7] activeEndpoint": this.activeEndpointEnv,
              fix: "Ensure CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET are set and match the Open API app credentials",
            }, `CTraderService [DIAG] ERROR_RES (JSON): ${finalMsg}`);

            // ── Endpoint auto-probe ─────────────────────────────────────────
            // "Corrupted frame" during app_auth = app not registered on this
            // endpoint.  Automatically retry on the alternate endpoint once.
            if (errCode === "UNKNOWN_ERROR" && desc === "Corrupted frame." && this.state === "app_auth") {
              // Guard: if this is the liveEndpointUpgrade attempt, the app is
              // DEMO-only — live accounts simply cannot be authed.
              if (this.liveEndpointUpgradeAttempted && this.activeEndpointEnv === "live") {
                logger.error({
                  fix: "Your Open API app is registered for DEMO only but your trading accounts are LIVE. Register the app for LIVE access at https://openapi.ctrader.com/ or create a demo trading account.",
                }, "CTraderService [DIAG] App is DEMO-only but accounts are LIVE — cannot complete Account Auth");
                this.liveEndpointUpgradeAttempted = false;
                // Override finalMsg so the UI shows a specific actionable error card (keyed on "DEMO only").
                finalMsg = "App registered for DEMO only but trading accounts are LIVE. Register the app for Live access at https://openapi.ctrader.com/ or connect a Demo trading account.";
              } else if (this.endpointProbe === 0) {
                const altEnv = this.activeEndpointEnv === "live" ? "demo" : "live";
                logger.warn({
                  failedEndpoint: this.activeEndpointEnv,
                  probingEndpoint: altEnv,
                }, `CTraderService: 'Corrupted frame' on ${this.activeEndpointEnv} endpoint — auto-probing ${altEnv} endpoint`);
                this.endpointProbe = 1;
                this.rxBuf = Buffer.alloc(0);
                this.clearStepTimeout();
                // socket will close momentarily; onClose will NOT auto-reconnect
                // (state is about to be set to "error") so we schedule manually.
                setTimeout(() => {
                  this.state = "disconnected";
                  this.lastError = null;
                  this.connect();
                }, 300);
                return;
              } else {
                // Both endpoints rejected — credential error
                logger.error({
                  triedLive: true,
                  triedDemo: true,
                  fix: "Verify your Open API app at https://openapi.ctrader.com/ — credentials may be invalid or the app may not be approved",
                }, "CTraderService [DIAG] Both LIVE and DEMO endpoints returned 'Corrupted frame' — credential error");
              }
            }
            // ────────────────────────────────────────────────────────────────

            this.clearStepTimeout();
            this.lastError      = finalMsg;
            this.lastStuckStep  = this.state;
            this.state          = "error";
            this.emit("status_change", this.getStatus());
          }
          this.rxBuf = Buffer.alloc(0);
        } catch { /* malformed JSON — fall through to binary parser */ }
      }
      return; // keep accumulating until the JSON object is complete
    }
    // ────────────────────────────────────────────────────────────────────────

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
        logger.info({
          endpoint: this.activeEndpointEnv,
          probeAttempt: this.endpointProbe,
          liveUpgrade: this.liveEndpointUpgradeAttempted,
        }, "CTraderService: App Auth OK ✓ → fetching accounts");
        this.endpointProbe = 0; // reset — we know which endpoint works
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
        // Proto: ProtoOAErrorRes { payloadType=1, errorCode(string)=2, description(string)=3 }
        const errCode = fields.find(f => f.num === 2 && f.type === 2)?.bytes?.toString("utf8") ?? "UNKNOWN";
        const desc = fields.find(f => f.num === 3 && f.type === 2)?.bytes?.toString("utf8");

        // ── Endpoint auto-probe ──────────────────────────────────────────────
        // "Corrupted frame." during app_auth means the application is not
        // registered on THIS endpoint.  Automatically retry on the alternate
        // endpoint once before surfacing a credential error.
        if (errCode === "UNKNOWN_ERROR" && desc === "Corrupted frame." && this.state === "app_auth") {
          if (this.endpointProbe === 0) {
            const altEnv = this.activeEndpointEnv === "live" ? "demo" : "live";
            logger.warn({
              failedEndpoint: this.activeEndpointEnv,
              probingEndpoint: altEnv,
            }, "CTraderService [DIAG] 'Corrupted frame' — application not registered on this endpoint; auto-probing alternate endpoint");
            this.endpointProbe = 1;
            this.clearStepTimeout();
            this.intentionalDisconnect = true;
            this.socket?.destroy();
            this.socket = null;
            this.state = "disconnected";
            this.rxBuf = Buffer.alloc(0);
            setTimeout(() => this.connect(), 200);
            return;
          }
          // Both endpoints rejected — surface a clear credential error
          logger.error({
            triedLive: true,
            triedDemo: true,
            fix: "Verify CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET on https://openapi.ctrader.com/ match your registered Open API application",
          }, "CTraderService [DIAG] Both LIVE and DEMO endpoints returned 'Corrupted frame' — credentials are invalid or app not approved");
        }
        // ────────────────────────────────────────────────────────────────────

        const msg = desc
          ? `cTrader API error ${errCode}: ${desc}`
          : `cTrader API error ${errCode}`;
        logger.error({ errCode, desc, stateAtError: this.state }, `CTraderService: ${msg}`);
        this.clearStepTimeout();
        this.lastError = msg;
        this.lastStuckStep = this.state; // which step was active when the error came in
        this.state = "error";
        this.emit("status_change", this.getStatus());
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
    const id     = process.env["CTRADER_CLIENT_ID"]     ?? "";
    const secret = process.env["CTRADER_CLIENT_SECRET"] ?? "";

    // ── [5] app_auth request payload diagnostics ─────────────────────────────
    const clientIdOk     = id.length > 0;
    const clientSecretOk = secret.length > 0;
    const maskValue = (s: string) => s.length <= 8
      ? "*".repeat(s.length)
      : s.slice(0, 4) + "…" + s.slice(-4);
    logger.info({
      "[1] clientIdLoaded":     clientIdOk,
      "[1] clientIdLength":     id.length,
      "[1] clientIdMasked":     clientIdOk ? maskValue(id) : "(empty — WILL FAIL)",
      "[2] clientSecretLoaded": clientSecretOk,
      "[2] clientSecretLength": secret.length,
      "[2] clientSecretMasked": clientSecretOk ? maskValue(secret) : "(empty — WILL FAIL)",
    }, "CTraderService [DIAG] App Auth — credential check");

    if (!clientIdOk || !clientSecretOk) {
      logger.error({
        clientIdMissing:     !clientIdOk,
        clientSecretMissing: !clientSecretOk,
        fix: "Set CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET in Replit Secrets or via the credential import UI",
      }, "CTraderService [DIAG] [5] APP AUTH PAYLOAD — MISSING CREDENTIALS — request will be rejected by server");
    }

    // Proto: ProtoOAApplicationAuthReq { payloadType=1, clientId=2, clientSecret=3 }
    // payloadType (field 1) is a proto2 *required* field — must be present in the inner
    // payload even though the outer ProtoMessage already carries it, or the server's
    // strict proto2 parser will reject the message with "Corrupted frame."
    const payload = Buffer.concat([
      varintField(1, BigInt(PT.APP_AUTH_REQ)),  // required payloadType = 2100
      stringField(2, id),
      stringField(3, secret),
    ]);
    logger.info({
      "[5] payloadType":  "APP_AUTH_REQ (2100)",
      "[5] payloadBytes": payload.length,
      "[5] field2_clientId_len":     id.length,
      "[5] field3_clientSecret_len": secret.length,
      "[5] payloadHex":   payload.toString("hex").slice(0, 96) + (payload.length > 48 ? "…" : ""),
    }, "CTraderService [DIAG] sending App Auth request payload");

    this.send(PT.APP_AUTH_REQ, payload);
    this.setStepTimeout("App Auth response (check CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET)");
  }

  private sendGetAccounts(): void {
    logger.info({ accessTokenPrefix: (this.accessToken ?? "").slice(0, 8) + "…" },
      "CTraderService: Get Trading Accounts API request sent");
    // Proto: ProtoOAGetAccountListByAccessTokenReq { payloadType=1, accessToken=2 }
    const payload = Buffer.concat([
      varintField(1, BigInt(PT.GET_ACCOUNTS_REQ)),
      stringField(2, this.accessToken ?? ""),
    ]);
    this.send(PT.GET_ACCOUNTS_REQ, payload);
    this.setStepTimeout("Get Trading Accounts response");
  }

  private handleGetAccountsRes(buf: Buffer): void {
    this.clearStepTimeout();
    const fields = decodeFields(buf);
    const accounts: CTraderAccount[] = [];
    for (const f of fields) {
      // Proto: ProtoOAGetAccountListByAccessTokenRes {
      //   payloadType=1, accessToken(string)=2, subscriptionStatus=3, ctidTraderAccount[]=4
      // }
      // Proto: ProtoOACtidTraderAccount {
      //   ctidTraderAccountId(uint64)=1, isLive(bool)=2, traderLogin(uint64)=3
      // }
      if (f.num === 4 && f.type === 2 && f.bytes) {
        const sub = decodeFields(f.bytes);
        const id = sub.find(s => s.num === 1 && s.type === 0)?.varint;
        const isLive = sub.find(s => s.num === 2 && s.type === 0)?.varint;
        const loginField = sub.find(s => s.num === 3 && s.type === 0);
        const login = loginField?.varint !== undefined ? loginField.varint.toString() : "";
        logger.info({ id: id?.toString(), isLive, login }, "CTraderService [DIAG] parsed ctidTraderAccount");
        if (id !== undefined) {
          accounts.push({
            ctidTraderAccountId: id,          // uint64 — no dezigzag
            isLive: isLive === 1n,
            traderLogin: login,
          });
        }
      }
    }
    this.accounts = accounts;

    logger.info({
      totalAccounts: accounts.length,
      accounts: accounts.map(a => ({
        id: a.ctidTraderAccountId.toString(),
        login: a.traderLogin,
        isLive: a.isLive,
      })),
    }, "CTraderService: Get Trading Accounts API response received");

    if (accounts.length === 0) {
      const msg = "No cTrader trading accounts found for this access token. " +
        "Ensure the OAuth scope includes 'trading' and the account is linked to this application.";
      logger.error({ accessTokenPrefix: (this.accessToken ?? "").slice(0, 8) + "…" },
        `CTraderService: ${msg}`);
      this.lastError = msg;
      this.lastStuckStep = "Get Trading Accounts";
      this.state = "error";
      this.emit("status_change", this.getStatus());
      return;
    }

    // Auto-select: prefer first live account (Fusion Markets or any broker)
    const live = accounts.find(a => a.isLive) ?? accounts[0];
    logger.info({
      selectedId: live.ctidTraderAccountId.toString(),
      selectedLogin: live.traderLogin,
      isLive: live.isLive,
      totalAccounts: accounts.length,
    }, "CTraderService: selected trading account");

    // ── Endpoint upgrade: LIVE accounts need the LIVE API endpoint ────────────
    // If APP_AUTH succeeded on the DEMO endpoint (probe=1) but accounts are LIVE,
    // tear down and reconnect to LIVE so ACCOUNT_AUTH can succeed.
    // Prevent infinite loops with a dedicated flag.
    if (this.activeEndpointEnv === "demo" && live.isLive && !this.liveEndpointUpgradeAttempted) {
      logger.warn({
        accountId: live.ctidTraderAccountId.toString(),
        accountIsLive: live.isLive,
        currentEndpoint: "demo",
        action: "reconnecting to live endpoint for Account Auth",
      }, "CTraderService: LIVE account found on DEMO endpoint — upgrading to LIVE endpoint");
      this.liveEndpointUpgradeAttempted = true;
      this.endpointProbe = 0;        // reset probe so connect() picks up LIVE
      this.activeAccount = live;     // cache selected account
      this.clearStepTimeout();
      this.intentionalDisconnect = true;
      this.socket?.destroy();
      this.socket = null;
      this.rxBuf = Buffer.alloc(0);
      setTimeout(() => {
        this.state = "disconnected";
        this.lastError = null;
        this.connect();
      }, 200);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    this.activeAccount = live;
    // Persist the resolved ctidAccountId back to broker_accounts so REST calls work
    // (The OAuth callback may have stored "pending" if the initial REST fetch failed)
    void this.persistResolvedAccountId(live.ctidTraderAccountId.toString());
    this.state = "account_auth";
    // Proto: ProtoOAAccountAuthReq { payloadType=1, ctidTraderAccountId(uint64)=2, accessToken=3 }
    // Note: ctidTraderAccountId is effectively uint64 on the wire (proto says sint64 but
    //       values are small positive integers, matching GET_ACCOUNTS_RES parsing without dezigzag)
    const payload = Buffer.concat([
      varintField(1, BigInt(PT.ACCOUNT_AUTH_REQ)),
      varintField(2, live.ctidTraderAccountId),   // uint64, NOT sint64/zigzag
      stringField(3, this.accessToken ?? ""),
    ]);
    logger.info({
      accountId: live.ctidTraderAccountId.toString(),
      endpoint: this.activeEndpointEnv,
      payloadHex: payload.toString("hex"),
    }, "CTraderService: sending Account Auth request");
    this.send(PT.ACCOUNT_AUTH_REQ, payload);
    this.setStepTimeout("Account Auth response");
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
    this.clearStepTimeout();
    const fields = decodeFields(buf);
    // Proto: ProtoOAAccountAuthRes { payloadType=1, ctidTraderAccountId(sint64)=2 }
    const acctId = fields.find(f => f.num === 2 && f.type === 0)?.varint;
    logger.info({
      acctId: acctId ? dezigzag(acctId).toString() : "?",
      accountId: this.activeAccount?.ctidTraderAccountId.toString(),
    }, "CTraderService: Account Auth OK — sending Symbol catalog request");
    this.state = "fetch_symbols";
    // Proto: ProtoOASymbolsListReq { payloadType=1, ctidTraderAccountId(sint64)=2 }
    const payload = Buffer.concat([
      varintField(1, BigInt(PT.SYMBOLS_LIST_REQ)),
      sint64Field(2, this.activeAccount!.ctidTraderAccountId),
    ]);
    this.send(PT.SYMBOLS_LIST_REQ, payload);
    this.setStepTimeout("Symbol catalog response (SYMBOLS_LIST_RES)");
  }

  private handleSymbolsListRes(buf: Buffer): void {
    this.clearStepTimeout();
    const fields = decodeFields(buf);
    const found = new Map<string, bigint>();
    for (const f of fields) {
      // Proto: ProtoOASymbolsListRes { payloadType=1, ctidTraderAccountId=2, symbol[]=3 }
      // Proto: ProtoOALightSymbol { symbolId(sint64)=1, symbolName=2, enabled=3 }
      if (f.num === 3 && f.type === 2 && f.bytes) {
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

    logger.info({ symbolCount: found.size }, "CTraderService: Symbol catalog response received");

    if (found.size === 0) {
      const msg = "Symbol catalog returned 0 symbols. The account may have no tradeable instruments.";
      logger.error({ accountId: this.activeAccount?.ctidTraderAccountId.toString() },
        `CTraderService: ${msg}`);
      this.lastError = msg;
      this.lastStuckStep = "Symbol catalog";
      this.state = "error";
      this.emit("status_change", this.getStatus());
      return;
    }

    this.symbolIds = found;
    logger.info({ count: found.size }, "CTraderService: symbol IDs resolved — fetching symbol details");

    this.state = "fetch_symbol_details";
    // Batch SYMBOL_BY_ID_REQ in chunks of 500 to stay within message size limits
    const ids = [...found.values()];
    const CHUNK = 500;
    const numChunks = Math.ceil(ids.length / CHUNK);
    this.detailBatchesPending = numChunks;
    logger.info({ totalSymbols: ids.length, chunks: numChunks }, "CTraderService: sending Symbol detail requests");
    // Proto: ProtoOASymbolByIdReq { payloadType=1, ctidTraderAccountId(sint64)=2, symbolId[](sint64)=3 }
    for (let i = 0; i < ids.length; i += CHUNK) {
      let payload = Buffer.concat([
        varintField(1, BigInt(PT.SYMBOL_BY_ID_REQ)),
        sint64Field(2, this.activeAccount!.ctidTraderAccountId),
      ]);
      for (const id of ids.slice(i, i + CHUNK)) payload = Buffer.concat([payload, sint64Field(3, id)]);
      this.send(PT.SYMBOL_BY_ID_REQ, payload);
    }
    this.setStepTimeout(`Symbol detail responses (${numChunks} batch(es))`);
  }

  private handleSymbolByIdRes(buf: Buffer): void {
    const fields = decodeFields(buf);
    for (const f of fields) {
      // Proto: ProtoOASymbolByIdRes { payloadType=1, ctidTraderAccountId=2, symbol[]=3 }
      if (f.num === 3 && f.type === 2 && f.bytes) {
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
    this.clearStepTimeout();
    logger.info({ count: this.symbolMeta.size }, "CTraderService: all symbol details fetched — subscribing to spot prices");
    this.subscribeToSpots();
  }

  private subscribeToSpots(): void {
    if (!this.activeAccount || this.symbolIds.size === 0) return;
    // Subscribe to ALL symbols from the broker in batches of 500
    const ids = [...this.symbolIds.values()];
    const CHUNK = 500;
    // Proto: ProtoOASubscribeSpotsReq { payloadType=1, ctidTraderAccountId(sint64)=2, symbolId[](sint64)=3 }
    for (let i = 0; i < ids.length; i += CHUNK) {
      let payload = Buffer.concat([
        varintField(1, BigInt(PT.SUBSCRIBE_SPOTS_REQ)),
        sint64Field(2, this.activeAccount.ctidTraderAccountId),
      ]);
      for (const id of ids.slice(i, i + CHUNK)) payload = Buffer.concat([payload, sint64Field(3, id)]);
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
    // Proto: ProtoOASpotEvent { payloadType=1, ctidTraderAccountId=2, symbolId(sint64)=3, bid(uint32)=4, ask(uint32)=5 }
    const rawSymId = fields.find(f => f.num === 3 && f.type === 0)?.varint;
    const bidRaw = fields.find(f => f.num === 4 && f.type === 0)?.varint;
    const askRaw = fields.find(f => f.num === 5 && f.type === 0)?.varint;

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
      // ProtoHeartbeatEvent has required payloadType=1 — must be present in inner payload
      this.send(PT.HEARTBEAT, varintField(1, BigInt(PT.HEARTBEAT)));
    }, 10_000);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.clearStepTimeout();
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
      lastStuckStep: this.lastStuckStep ?? null,
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

  private async saveToken(): Promise<void> {
    await pool.query("DELETE FROM ctrader_connections");
    await pool.query(
      "INSERT INTO ctrader_connections (access_token, refresh_token, expires_at) VALUES ($1, $2, $3)",
      [this.accessToken, this.refreshToken ?? "", this.tokenExpiresAt],
    );
  }

  private async loadToken(): Promise<{ access_token: string; refresh_token: string | null; expires_at: Date | null } | null> {
    const r = await pool.query("SELECT * FROM ctrader_connections ORDER BY id DESC LIMIT 1");
    if (!r.rows[0]) return null;
    return {
      access_token: r.rows[0].access_token as string,
      refresh_token: (r.rows[0].refresh_token as string) || null,
      expires_at: r.rows[0].expires_at as Date | null,
    };
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
