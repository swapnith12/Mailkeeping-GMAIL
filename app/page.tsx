import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignInButton from "@/components/SignInButton";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="landing">
      <div className="landing-inner">
        <h1 className="wordmark">Mailkeep</h1>
        <p className="tagline">
          Connect your Gmail and let it sort itself: spam and promotions
          cleared out, bills flagged, and schedules turned into calendar
          events.
        </p>
        <ul className="feature-list">
          <li>Scans your inbox and sorts mail into clear categories</li>
          <li>Flags bills and turns meeting requests into calendar events</li>
          <li>Clears out spam and promotions on your say-so, nothing deleted silently</li>
        </ul>
        <SignInButton />
      </div>
    </main>
  );
}
