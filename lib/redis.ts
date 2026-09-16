import { Redis } from "@upstash/redis";

/**
 * Upstash's client talks over HTTPS (each command is one REST call), not a
 * persistent TCP connection — which is exactly why it's the right fit for
 * Vercel: a serverless function that opened a real TCP connection to
 * Redis on every cold start (and never reliably closed it) is a classic
 * way to exhaust a Redis plan's connection limit. There's no connection
 * pool here to leak across invocations or Next.js hot-reloads.
 *
 * Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the
 * environment (see .env.example) — both come straight from the Upstash
 * console's REST API section, not the redis:// / TLS connection string
 * shown elsewhere on that page.
 */
export const redis = Redis.fromEnv();
