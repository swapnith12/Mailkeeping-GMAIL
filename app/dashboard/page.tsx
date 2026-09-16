import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import ScanPanel from "@/components/ScanPanel";
import UpgradeButton from "@/components/UpgradeButton";
import ConnectCalendarButton from "@/components/ConnectCalendarButton";
import { indexEmailToGoogleSub, isSubscribed } from "@/lib/subscription";

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  // Cheap, idempotent write on every dashboard load. This is what lets
  // scripts/grant-test-subscription.mjs resolve an email address to a
  // googleSub — it can only do that after the account has signed in at
  // least once.
  if (session.user?.email && session.googleSub) {
    await indexEmailToGoogleSub(session.user.email, session.googleSub);
  }

  const subscribed = session.googleSub ? await isSubscribed(session.googleSub) : false;
  const hasCalendarScope = Boolean(session.hasCalendarScope);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Your inbox</h2>
          <p className="account-line">
            {session.user?.email}
            {subscribed && <span className="badge-pro">Pro</span>}
          </p>
        </div>
        <div className="dashboard-actions">
          {!subscribed && <UpgradeButton />}
          {subscribed && !hasCalendarScope && <ConnectCalendarButton />}
          <SignOutButton />
        </div>
      </div>

      <ScanPanel subscribed={subscribed} hasCalendarScope={hasCalendarScope} />
    </div>
  );
}
