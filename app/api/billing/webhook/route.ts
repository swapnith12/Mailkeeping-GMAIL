import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  setSubscriptionActive,
  setSubscriptionCanceled,
  getGoogleSubByCustomerId,
} from "@/lib/subscription";

// Stripe signs the raw request body — Next.js's App Router doesn't parse
// the body unless you call .json()/.text() yourself, so req.text() below
// gives us the exact bytes Stripe signed. Don't add a bodyParser config or
// call req.json() first; either breaks signature verification.
export const dynamic = "force-dynamic";

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Fires right after a successful checkout — this is what grants
      // access the first time someone subscribes.
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const googleSub = cs.client_reference_id;
        const custId = customerId(cs.customer);
        const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id;

        if (googleSub && custId && subId) {
          await setSubscriptionActive(googleSub, custId, subId);
        } else {
          console.error("checkout.session.completed missing expected fields", {
            googleSub,
            custId,
            subId,
          });
        }
        break;
      }

      // Covers renewals, plan changes, and status flips (e.g. into
      // past_due) without a fresh checkout — these only carry a customer
      // id, so we resolve back to googleSub via the index checkout wrote.
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const custId = customerId(sub.customer);
        if (!custId) break;

        const googleSub = await getGoogleSubByCustomerId(custId);
        if (!googleSub) break;

        if (sub.status === "active" || sub.status === "trialing") {
          await setSubscriptionActive(googleSub, custId, sub.id);
        } else {
          await setSubscriptionCanceled(googleSub);
        }
        break;
      }

      // Subscription fully ended (canceled, or payment failures ran out
      // of retries) — revoke access.
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const custId = customerId(sub.customer);
        if (!custId) break;

        const googleSub = await getGoogleSubByCustomerId(custId);
        if (googleSub) await setSubscriptionCanceled(googleSub);
        break;
      }

      default:
        // Plenty of other event types exist; we only act on the ones above.
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe webhook event ${event.type}:`, err);
    // Still 200 — Stripe retries on non-2xx, and retrying a bug in our own
    // handling code won't fix itself. Log it and investigate instead.
  }

  return NextResponse.json({ received: true });
}
