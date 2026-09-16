// Manually grants subscribed (Pro) access to an account, bypassing Stripe
// entirely. For internal/test accounts only — real users should go through
// Checkout (see app/api/billing/checkout/route.ts).
//
// The account has to have signed in at least once already: this looks up
// their googleSub via the email index that app/dashboard/page.tsx writes
// on every dashboard load. If it can't find the mapping, sign in with that
// Google account first, then re-run this.
//
// Usage:
//   node --env-file=.env.local scripts/grant-test-subscription.mjs someone@example.com
//
// To revoke:
//   node --env-file=.env.local scripts/grant-test-subscription.mjs someone@example.com --revoke

import { Redis } from "@upstash/redis";

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/grant-test-subscription.mjs <email> [--revoke]");
  process.exit(1);
}

const redis = Redis.fromEnv();

const emailKey = `sub:emailIndex:${email.toLowerCase()}`;
const googleSub = await redis.get(emailKey);

if (!googleSub) {
  console.error(
    `No account found for ${email}. They need to sign in at least once ` +
      `(visit /dashboard) before this script can find their account.`
  );
  process.exit(1);
}

const statusKey = `sub:status:${googleSub}`;

if (revoke) {
  await redis.hset(statusKey, {
    status: "canceled",
    updatedAt: new Date().toISOString(),
  });
  console.log(`Revoked subscribed access for ${email} (googleSub: ${googleSub}).`);
} else {
  await redis.hset(statusKey, {
    status: "active",
    stripeCustomerId: "manual",
    stripeSubscriptionId: "manual",
    updatedAt: new Date().toISOString(),
  });
  console.log(`Granted subscribed access to ${email} (googleSub: ${googleSub}).`);
}
// Nothing to close — Upstash's client is HTTP-based, no persistent
// connection to tear down like the old ioredis client needed.
