import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function boolFromEnv(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Pool sizing — match the upstream Postgres `max_connections` / 2× app instances.
 * When fronted by PgBouncer in transaction mode, set `DATABASE_POOL_MAX` to a
 * small number per app instance (e.g. 5–10) and let PgBouncer multiplex.
 */
function poolConfig() {
  const url = process.env.DATABASE_URL!;
  // Aiven / RDS / Supabase use a CA-signed certificate Node.js doesn't trust
  // out of the box. `sslmode=require` only enables TLS; cert validation
  // happens regardless and fails with "self-signed certificate in chain".
  // Setting `ssl.rejectUnauthorized: false` mirrors libpq's `require` mode
  // (encrypt the wire, skip chain validation) — same trade-off every
  // managed-Postgres SDK takes by default.
  const needsSsl = /sslmode=(require|prefer|verify-ca|verify-full)/i.test(url) || /aivencloud\.com|\.rds\.amazonaws\.com|supabase\.co/i.test(url);
  return {
    connectionString: url,
    max: intFromEnv("DATABASE_POOL_MAX", 10),
    idleTimeoutMillis: intFromEnv("DATABASE_POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: intFromEnv("DATABASE_POOL_CONNECT_TIMEOUT_MS", 5_000),
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } as const } : {}),
  };
}

type AppPrismaClient = PrismaClient;

function createPrismaClient(): AppPrismaClient {
  const adapter = new PrismaPg(poolConfig());
  const base = new PrismaClient({ adapter });

  if (!boolFromEnv("PRISMA_LOG_QUERIES")) return base;

  // Lazy import so the server-only logger module isn't pulled in when query logging is off.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { logger } = require("@/lib/logger") as typeof import("@/lib/logger");

  // `$extends` returns a structurally narrower client type — cast back to the
  // base PrismaClient since the query extension only observes, never mutates.
  return base.$extends({
    name: "query-audit",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = performance.now();
          try {
            return await query(args);
          } finally {
            logger.info(
              { scope: "prisma.query", model, op: operation, ms: +(performance.now() - start).toFixed(2) },
              "prisma.query",
            );
          }
        },
      },
    },
  }) as unknown as AppPrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
