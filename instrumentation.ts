export async function register() {
  // The Node.js runtime is the only one that has real process.env access
  // to everything (Stripe secret key, etc.) — nothing to check on the
  // edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkRequiredEnv } = await import("@/lib/env-check");
    checkRequiredEnv();
  }
}
