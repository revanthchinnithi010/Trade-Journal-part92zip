import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Add your Supabase connection string to Replit Secrets.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                        // Supabase free plan: stay well under 20-connection limit
  idleTimeoutMillis: 60_000,     // Release idle connections after 60s
  connectionTimeoutMillis: 10_000,
  keepAlive: true,               // Prevent NAT/firewall from dropping idle connections
  statement_timeout: 15_000,     // Kill runaway queries after 15s
  application_name: "tradevault",
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

pool.on("connect", () => {
  console.info("[DB] New client connected to PostgreSQL");
});

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export * from "./schema";
