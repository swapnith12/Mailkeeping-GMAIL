import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trashMessage, GmailAuthError } from "@/lib/gmail";
import { isSubscribed } from "@/lib/subscription";
import { invalidateCachedScanResult } from "@/lib/cache";

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Enforced here, not just hidden in the UI — a subscribed check on the
  // client is a display choice, not a security boundary.
  if (!(await isSubscribed(session.googleSub))) {
    return NextResponse.json(
      { error: "Deleting emails is a Pro feature. Upgrade to use it." },
      { status: 403 }
    );
  }

  const { id } = await req.json().catch(() => ({ id: undefined }));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing email id" }, { status: 400 });
  }

  try {
    await trashMessage(session.accessToken, id);
    // Otherwise a scan run in the next 6h would still serve this email
    // from cache as if it were still sitting in the inbox.
    await invalidateCachedScanResult(session.googleSub, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return NextResponse.json(
        { error: "Your Google session expired. Please sign in again." },
        { status: 401 }
      );
    }
    console.error("Delete failed:", err);
    return NextResponse.json({ error: "Couldn't delete that email. Try again." }, { status: 500 });
  }
}
