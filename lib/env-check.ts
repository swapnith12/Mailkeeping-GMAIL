/**
 * Fails loudly at boot if a required env var is missing, instead of
 * failing later and confusingly — e.g. Stripe webhooks silently
 * no-op'ing because STRIPE_WEBHOOK_SECRET was never set, or every
 * Redis-backed feature (quota, subscription status, scan cache) throwing
 * because the Upstash credentials were never configured in the Vercel
 * project. Only runs in production: local dev already gets a clear error
 * the moment you hit the code path that needs the missing value.
 */
const REQUIRED_IN_PRODUCTION = [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "GEMINI_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export function checkRequiredEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s) in production: ${missing.join(", ")}. ` +
        "Set them in the Vercel project's Environment Variables settings (see .env.example)."
    );
  }

  // AUTH_URL isn't in the required list above — Auth.js auto-detects the
  // host on Vercel's own infrastructure. It's still worth setting
  // explicitly if you're on a custom domain rather than *.vercel.app, so
  // check for an obvious mismatch rather than silently trusting whatever
  // Vercel infers.
  if (process.env.AUTH_URL && !process.env.AUTH_URL.startsWith("https://")) {
    console.warn(
      `AUTH_URL is set to "${process.env.AUTH_URL}" — this should be the https:// URL ` +
        "users actually hit, matching the redirect URI configured in Google Cloud Console."
    );
  }
}
