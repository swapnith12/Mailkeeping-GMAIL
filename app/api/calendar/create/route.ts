import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCalendarEvent, CalendarAuthError } from "@/lib/calendar";
import { isSubscribed } from "@/lib/subscription";

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.accessToken || !session.googleSub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await isSubscribed(session.googleSub))) {
    return NextResponse.json(
      { error: "Adding to calendar is a Pro feature. Upgrade to use it." },
      { status: 403 }
    );
  }

  if (!session.hasCalendarScope) {
    return NextResponse.json(
      { error: "Calendar isn't connected yet. Click \"Connect calendar\" first.", code: "CALENDAR_NOT_CONNECTED" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const { summary, description, start, end } = body ?? {};
  if (!summary || !start || !end) {
    return NextResponse.json({ error: "Missing summary, start, or end" }, { status: 400 });
  }

  try {
    const event = await createCalendarEvent(session.accessToken, { summary, description, start, end });
    return NextResponse.json({ ok: true, htmlLink: event.htmlLink });
  } catch (err) {
    if (err instanceof CalendarAuthError) {
      return NextResponse.json(
        { error: "Google rejected the calendar request. Try reconnecting calendar.", code: "CALENDAR_NOT_CONNECTED" },
        { status: 401 }
      );
    }
    console.error("Calendar event creation failed:", err);
    return NextResponse.json({ error: "Couldn't create the event. Try again." }, { status: 500 });
  }
}
