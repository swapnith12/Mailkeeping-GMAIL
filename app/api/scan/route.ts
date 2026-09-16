import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GmailAuthError } from "@/lib/gmail";
import { runInboxAgent } from "@/lib/classify";
import { checkAndConsumeScanQuota } from "@/lib/quota";
import { isSubscribed } from "@/lib/subscription";

const FREE_TIER_LIMIT = 100;
// Not literally "every email ever" — MAX_AGENT_TURNS in classify.ts caps
// how much a single scan can churn through regardless of this number, so
// it's a generous ceiling for a normal inbox, not a guarantee of zero
// cutoff. Raise both together if a real mailbox needs more.
const PAID_TIER_LIMIT = 500;

export async function GET() {
  const session = await auth();

  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Your Google session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const subscribed = await isSubscribed(session.googleSub);

  // Subscribed accounts skip the daily counter entirely — quota.ts is
  // free-tier-only machinery.
  let quota: { used: number; limit: number } | null = null;
  if (!subscribed) {
    const result = await checkAndConsumeScanQuota(session.googleSub);
    if (!result.allowed) {
      return NextResponse.json(
        {
          error: `You've used all ${result.limit} free scans for today. Come back tomorrow, or upgrade for unlimited scans.`,
        },
        { status: 429 }
      );
    }
    quota = result;
  }

  const scanLimit = subscribed ? PAID_TIER_LIMIT : FREE_TIER_LIMIT;

  try {
    const { scanned, counts, emails, cacheHits } = await runInboxAgent(
      session.accessToken,
      scanLimit,
      session.googleSub,
      subscribed
    );

    return NextResponse.json({
      scanned,
      limit: scanLimit,
      counts,
      emails,
      subscribed,
      cacheHits,
      scansUsedToday: quota?.used ?? null,
      scansPerDay: quota?.limit ?? null,
    });
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return NextResponse.json(
        { error: "Your Google session expired. Please sign in again." },
        { status: 401 }
      );
    }
    console.error("Scan failed:", err);
    return NextResponse.json({ error: "Scan failed. Try again in a moment." }, { status: 500 });
  }
}
