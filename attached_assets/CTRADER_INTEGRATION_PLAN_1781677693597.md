# cTrader OpenAPI Integration Plan

Reference implementation: `artifacts/ctrader-oauth-test/server.js`

---

## 1. Environment Variables (Secrets)

| Variable | Where set | Purpose |
|---|---|---|
| `CTRADER_CLIENT_ID` | Server env/secrets | OAuth app client ID from Spotware |
| `CTRADER_CLIENT_SECRET` | Server env/secrets | OAuth app client secret from Spotware |
| `CTRADER_REDIRECT_URI` | Server env/secrets | Override for OAuth callback URL (must be a `.replit.app` domain) |

OAuth **only works from a deployed `.replit.app` domain**, not from `.replit.dev`.

---

## 2. OAuth Flow (HTTP)

### 2a. Start OAuth — `GET /auth/ctrader/start`

Redirects the user to Spotware's authorization page.

```
GET https://connect.spotware.com/apps/auth
  ?client_id=<CTRADER_CLIENT_ID>
  &redirect_uri=<CTRADER_REDIRECT_URI>
  &response_type=code
  &scope=trading
  &state=<random_hex_16>
```

**Implementation notes:**
- Generate a `state` token with `crypto.randomBytes(16).toString("hex")`
- Store `state → timestamp` in a server-side Map or session store to prevent CSRF
- `redirect_uri` must exactly match what is registered in the Spotware portal

### 2b. OAuth Callback — `GET /auth/ctrader/callback`

Exchanges the authorization `code` for tokens.

**Request:** Spotware redirects here with `?code=…&state=…`

**Token exchange POST:**
```
POST https://connect.spotware.com/apps/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=<CTRADER_REDIRECT_URI>
&client_id=<CTRADER_CLIENT_ID>
&client_secret=<CTRADER_CLIENT_SECRET>
```

**Token response fields:**
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "Bearer",
  "expires_in": 2592000
}
```

**After success:** Store tokens (see §6 Database), then redirect or return tokens to frontend.

### 2c. Token Refresh — `POST /auth/ctrader/refresh`

```
POST https://connect.spotware.com/apps/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<stored_refresh_token>
&client_id=<CTRADER_CLIENT_ID>
&client_secret=<CTRADER_CLIENT_SECRET>
```

Or use cTrader WebSocket message `2158 PROTO_OA_REFRESH_TOKEN_REQ` directly.

---

## 3. cTrader WebSocket Endpoints

| Environment | URL |
|---|---|
| Demo | `wss://demo.ctraderapi.com:5035` |
| Live | `wss://live.ctraderapi.com:5035` |

Use `ws` npm package server-side. **Do not expose the WebSocket directly to the browser** — proxy through your backend.

---

## 4. Protobuf Helpers (copy as-is from reference)

Create file: `src/lib/ctrader/protobuf.js` (or `.ts`)

These are pure functions with no dependencies — copy directly from `server.js` lines 29–57:

| Function | Purpose |
|---|---|
| `varint(n)` | Encode unsigned integer as varint bytes |
| `pbVarint(fieldNum, value)` | Encode a varint field |
| `pbBytes(fieldNum, data)` | Encode a length-delimited field |
| `pbString(fieldNum, str)` | Encode a string field |
| `zigzagEncode(n)` / `zigzagDecode(n)` | Convert signed int ↔ unsigned varint (for sint64 account IDs) |
| `pbSint64(fieldNum, value)` | Encode a sint64 field (used for `ctidTraderAccountId`) |
| `frame(payloadType, innerBuf)` | Wrap a payload into a cTrader 4-byte-prefixed frame |

Copy decoder too (`readVarintAt`, `decodeFields`, `splitFrames`, `fieldVal`) for parsing responses.

---

## 5. Initialization Chain (WebSocket, server-side)

Create file: `src/lib/ctrader/initChain.js` (or `.ts`)

This is the core post-OAuth sequence. Run on your server, never in the browser.

### Step 1 — App Auth (2100 → 2101)

On WebSocket `open`, immediately send:

```
payloadType: 2100  PROTO_OA_APPLICATION_AUTH_REQ
  field 1 (string): CTRADER_CLIENT_ID
  field 2 (string): CTRADER_CLIENT_SECRET
```

Wait for response `2101 PROTO_OA_APPLICATION_AUTH_RES`. No fields to read — receipt = success.

### Step 2 — Get Accounts (2149 → 2150)

After `2101`, send:

```
payloadType: 2149  PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ
  field 1 (string): access_token
```

Wait for `2150 PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES`.

Parse repeated field 1 (sub-messages) — each is a `ProtoOACtidTraderAccount`:

```
sub-message fields:
  field 1 (sint64): ctidTraderAccountId  ← decode with zigzagDecode()
  field 2 (bool):   isLive
  field 3 (string): traderLogin
```

**Critical:** `ctidTraderAccountId` is **sint64 zigzag-encoded**. Always apply `zigzagDecode()` before using the value. Using the raw varint value will produce a wrong ID and silently fail account auth.

### Step 3 — Account Auth (2102 → 2103)

For each account you want to use, send:

```
payloadType: 2102  PROTO_OA_ACCOUNT_AUTH_REQ
  field 1 (sint64): ctidTraderAccountId  ← encode with pbSint64()
  field 2 (string): access_token
```

Wait for `2103 PROTO_OA_ACCOUNT_AUTH_RES`.
Response echoes `ctidTraderAccountId` in field 1 (sint64) — verify it matches.

### Step 4 — Symbols List (2121 → 2122)

After `2103`, send:

```
payloadType: 2121  PROTO_OA_SYMBOLS_LIST_REQ
  field 1 (sint64): ctidTraderAccountId
```

Wait for `2122 PROTO_OA_SYMBOLS_LIST_RES`.

Parse repeated field 2 — each is a `ProtoOALightSymbol`:

```
sub-message fields:
  field 1 (int64/varint): symbolId
  field 2 (string):       symbolName   e.g. "EURUSD"
  field 3 (bool):         enabled
  field 4 (varint):       baseAssetId
  field 5 (varint):       quoteAssetId
  field 6 (varint):       symbolCategoryId
```

Store the `symbolId → symbolName` mapping — you need `symbolId` to subscribe to quotes.

### Step 5 — Subscribe Spots (2131 → 2132)

After parsing symbols, send one subscription request per symbol (or batch):

```
payloadType: 2131  PROTO_OA_SUBSCRIBE_SPOTS_REQ
  field 1 (sint64):         ctidTraderAccountId
  field 3 (repeated varint): symbolId(s)
```

Wait for `2132 PROTO_OA_SUBSCRIBE_SPOTS_RES` (confirms subscription).

After that, live `2135 PROTO_OA_SPOT_EVENT` frames arrive:

```
field 1 (sint64): ctidTraderAccountId
field 2 (varint): symbolId
field 3 (varint): bid  (price × 100000, i.e. divide by 100000 for decimal)
field 4 (varint): ask
field 5 (varint): sessionClose (optional)
field 6 (varint): timestamp (unix ms)
```

### Heartbeat

While the connection is open, cTrader sends `2107 PROTO_OA_HEARTBEAT_EVENT` periodically.
**Do not close the connection on heartbeat.** Simply ignore or optionally echo back a heartbeat.

### Error Response

Any step can receive `2142 PROTO_OA_ERROR_RES`:

```
field 1 (varint): errorCode
field 2 (string): description
```

On `2142`, abort the chain and surface the errorCode + description to the user.

---

## 6. Database Changes

Add these tables/columns to your schema:

### `ctrader_tokens` table

```sql
CREATE TABLE ctrader_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `ctrader_accounts` table

```sql
CREATE TABLE ctrader_accounts (
  id                      SERIAL PRIMARY KEY,
  user_id                 INTEGER REFERENCES users(id),
  ctid_trader_account_id  BIGINT NOT NULL UNIQUE,  -- zigzag-decoded sint64
  trader_login            TEXT,
  is_live                 BOOLEAN DEFAULT FALSE,
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### `ctrader_symbols` table (optional cache)

```sql
CREATE TABLE ctrader_symbols (
  id                      SERIAL PRIMARY KEY,
  ctid_trader_account_id  BIGINT NOT NULL,
  symbol_id               BIGINT NOT NULL,
  symbol_name             TEXT NOT NULL,
  enabled                 BOOLEAN DEFAULT TRUE,
  UNIQUE(ctid_trader_account_id, symbol_id)
);
```

---

## 7. Backend Files to Create

```
src/
  lib/
    ctrader/
      protobuf.ts       ← varint/frame encode+decode helpers (copy from reference)
      initChain.ts      ← runs the 5-step initialization over a WebSocket
      wsManager.ts      ← manages one persistent WS connection per account
      constants.ts      ← PAYLOAD_TYPES map, WS endpoint URLs
  routes/
    auth/
      ctrader.ts        ← GET /auth/ctrader/start
                           GET /auth/ctrader/callback
                           POST /auth/ctrader/refresh
    ctrader/
      accounts.ts       ← GET /api/ctrader/accounts
      symbols.ts        ← GET /api/ctrader/symbols/:accountId
      quotes.ts         ← GET /api/ctrader/quotes/stream (SSE)
```

---

## 8. Frontend Components / Hooks

```
src/
  hooks/
    useCtraderInit.ts   ← calls /api/ctrader/quotes/stream (SSE),
                           tracks step states, emits accounts + quote events
    useCtraderQuotes.ts ← subscribes to live quote updates from the SSE stream

  components/
    CtraderConnect.tsx  ← "Connect" button, endpoint selector, step status display
    AccountList.tsx     ← renders accounts from useCtraderInit
    LiveQuotes.tsx      ← renders quote table, updates in real time
    InitSteps.tsx       ← step-by-step status card (pending / running / ok / fail)
```

### SSE protocol (server → client)

The server streams initialization progress and live data over SSE at `/api/ctrader/quotes/stream`.

Use these prefixed event lines so the frontend can parse them without a full JSON parse on every message:

| Prefix | Payload | Meaning |
|---|---|---|
| `STEP:<key>:<state>:<detail>` | string | Step changed state (`pending`/`running`/`ok`/`fail`) |
| `ACCOUNTS:<json>` | JSON array | List of accounts after step 2 completes |
| `QUOTE:<json>` | `{symbol,bid,ask,timestamp}` | Live spot price update |
| *(plain text)* | log line | Diagnostic log line for display |

Step keys: `app-auth`, `get-accounts`, `account-auth`, `symbols`, `quotes`

---

## 9. Key Gotchas

| # | Issue | Fix |
|---|---|---|
| 1 | `ctidTraderAccountId` is **sint64 zigzag** | Always `zigzagDecode()` on read, `pbSint64()` on write |
| 2 | OAuth redirect only works on `.replit.app` | Deploy before testing OAuth; `.replit.dev` is blocked by Spotware |
| 3 | Spot prices are integers × 100000 | Divide bid/ask by 100000 for decimal prices |
| 4 | Each WS message may contain **multiple** cTrader frames | Use `splitFrames()` to split on the 4-byte length prefix before decoding |
| 5 | Heartbeat `2107` must not close the connection | Ignore or respond — closing on heartbeat drops the feed |
| 6 | Account auth (`2102`) must be sent **per account** | One `2102` per `ctidTraderAccountId`; can't auth multiple at once |
| 7 | `rejectUnauthorized: false` needed for WS | cTrader's TLS cert chain requires this option in `ws` |

---

## 10. Implementation Order

1. Copy `protobuf.ts` helpers (no deps, safe to do first)
2. Add env secrets (`CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`)
3. Add DB tables (`ctrader_tokens`, `ctrader_accounts`)
4. Build OAuth routes (`/start`, `/callback`) — test with deployed URL
5. Build `initChain.ts` — wire up steps 1-5, log every step
6. Build SSE endpoint that runs `initChain` and streams progress
7. Build `useCtraderInit` hook consuming the SSE stream
8. Build `InitSteps`, `AccountList`, `LiveQuotes` components
9. Store symbols in DB after step 4 succeeds
10. Wire live `SPOT_EVENT` quotes into your journal trade entry flow
