const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEventInput {
  summary: string;
  description?: string;
  /** ISO 8601 datetime, e.g. "2026-09-15T14:00:00-07:00" */
  start: string;
  /** ISO 8601 datetime, must be after start */
  end: string;
}

class CalendarAuthError extends Error {
  constructor() {
    super("Google rejected the access token for Calendar (expired, revoked, or missing calendar scope)");
    this.name = "CalendarAuthError";
  }
}

/** Creates an event on the user's primary calendar. */
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventInput
): Promise<{ id: string; htmlLink: string }> {
  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
    }),
  });

  if (res.status === 401 || res.status === 403) throw new CalendarAuthError();
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${body}`);
  }

  return res.json();
}

export { CalendarAuthError };
