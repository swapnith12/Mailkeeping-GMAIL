import Stripe from "stripe";

// Pinned explicitly rather than left to the account default, per Stripe's
// own recommendation — an account's default API version can change without
// this codebase changing. Current as of writing (Sept 2026):
// https://docs.stripe.com/sdks/versioning?lang=node
// If requests start failing with a version-mismatch error, check that link
// for the current version and bump this string (and the `stripe` package
// version in package.json) together.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia",
});
