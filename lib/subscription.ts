import { redis } from "@/lib/redis";

export type SubscriptionState = "active" | "canceled" | "none";

export interface SubscriptionInfo {
  status: SubscriptionState;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  updatedAt?: string;
}

// Keyed on googleSub, same identity anchor quota.ts uses — stable across
// cookie clears and browser switches, unlike a session id.
const statusKey = (googleSub: string) => `sub:status:${googleSub}`;

// Stripe's subscription-lifecycle webhooks (updated/deleted) only carry a
// Stripe customer id, not our googleSub — this index lets us find our way
// back to the account those events belong to.
const customerIndexKey = (customerId: string) => `sub:customerIndex:${customerId}`;

// Lets an operator grant test/internal accounts subscribed access by email
// before they've been through Stripe at all — see
// scripts/grant-test-subscription.mjs. Populated on every dashboard load.
const emailIndexKey = (email: string) => `sub:emailIndex:${email.toLowerCase()}`;

export async function isSubscribed(googleSub: string): Promise<boolean> {
  const status = await redis.hget(statusKey(googleSub), "status");
  return status === "active";
}

export async function getSubscription(googleSub: string): Promise<SubscriptionInfo> {
  const data = await redis.hgetall<Record<string, string>>(statusKey(googleSub));
  if (!data || !data.status) return { status: "none" };
  return {
    status: data.status as SubscriptionState,
    stripeCustomerId: data.stripeCustomerId,
    stripeSubscriptionId: data.stripeSubscriptionId,
    updatedAt: data.updatedAt,
  };
}

export async function setSubscriptionActive(
  googleSub: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string
): Promise<void> {
  await redis.hset(statusKey(googleSub), {
    status: "active",
    stripeCustomerId,
    stripeSubscriptionId,
    updatedAt: new Date().toISOString(),
  });
  await redis.set(customerIndexKey(stripeCustomerId), googleSub);
}

export async function setSubscriptionCanceled(googleSub: string): Promise<void> {
  await redis.hset(statusKey(googleSub), {
    status: "canceled",
    updatedAt: new Date().toISOString(),
  });
}

export async function getGoogleSubByCustomerId(customerId: string): Promise<string | null> {
  return redis.get(customerIndexKey(customerId));
}

export async function indexEmailToGoogleSub(email: string, googleSub: string): Promise<void> {
  await redis.set(emailIndexKey(email), googleSub);
}

export async function getGoogleSubByEmail(email: string): Promise<string | null> {
  return redis.get(emailIndexKey(email));
}
