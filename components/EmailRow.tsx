"use client";

import { useState } from "react";
import type { ScannedEmail } from "@/lib/classify";
import ConnectCalendarButton from "@/components/ConnectCalendarButton";

interface EmailRowProps {
  email: ScannedEmail;
  subscribed: boolean;
  hasCalendarScope: boolean;
  canScheduleCategory: boolean;
}

type RowState = "idle" | "confirm-delete" | "deleting" | "deleted" | "error";

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Falls back to tomorrow 9am, one hour long, only when the agent didn't
 * find an actual date in the email (or its suggestion failed to parse) —
 * still a starting point the user is expected to adjust, never presented
 * as if it came from the email itself.
 */
function defaultEventTimes() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

/** Uses the agent's suggested date/time when it found one and it parses cleanly; otherwise the dumb tomorrow-9am default. */
function initialEventTimes(email: ScannedEmail) {
  if (email.suggestedEvent) {
    const start = new Date(email.suggestedEvent.start);
    const end = new Date(email.suggestedEvent.end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start: toLocalInput(start), end: toLocalInput(end) };
    }
  }
  return defaultEventTimes();
}

export default function EmailRow({ email, subscribed, hasCalendarScope, canScheduleCategory }: EmailRowProps) {
  const [rowState, setRowState] = useState<RowState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventState, setEventState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [eventError, setEventError] = useState("");
  const [times, setTimes] = useState(() => initialEventTimes(email));
  const [title, setTitle] = useState(email.suggestedEvent?.summary ?? email.subject);

  async function handleDelete() {
    setRowState("deleting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/mail/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: email.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setRowState("deleted");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Delete failed");
      setRowState("error");
    }
  }

  async function handleAddToCalendar() {
    setEventState("saving");
    setEventError("");
    try {
      const res = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: title,
          description: `From: ${email.from}\n\n${email.snippet}`,
          start: times.start,
          end: times.end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create event");
      setEventState("saved");
    } catch (err) {
      setEventError(err instanceof Error ? err.message : "Couldn't create event");
      setEventState("error");
    }
  }

  if (rowState === "deleted") {
    return (
      <li className="email-row email-row-deleted">
        <span>Deleted</span>
      </li>
    );
  }

  return (
    <li className="email-row">
      <div className="email-row-main">
        <div className="email-row-text">
          <span className="email-subject">
            {email.subject}
            {subscribed && email.recommendedDelete && rowState === "idle" && (
              <span className="badge-suggestion" title="The scan flagged this as likely safe to delete — still your call.">
                Suggested: delete
              </span>
            )}
          </span>
          <span className="email-from">{email.from}</span>
        </div>

        {subscribed && (
          <div className="email-row-actions">
            {canScheduleCategory && (
              <button className="btn-ghost btn-small" onClick={() => setShowEventForm((v) => !v)}>
                {showEventForm ? "Cancel" : email.suggestedEvent ? "Add to calendar (date found)" : "Add to calendar"}
              </button>
            )}

            {rowState === "idle" && (
              <button className="btn-ghost btn-small" onClick={() => setRowState("confirm-delete")}>
                Delete
              </button>
            )}
            {rowState === "confirm-delete" && (
              <>
                <span className="confirm-text">Delete this email?</span>
                <button className="btn-danger btn-small" onClick={handleDelete}>
                  Confirm
                </button>
                <button className="btn-ghost btn-small" onClick={() => setRowState("idle")}>
                  Cancel
                </button>
              </>
            )}
            {rowState === "deleting" && <span className="confirm-text">Deleting…</span>}
          </div>
        )}
      </div>

      {rowState === "error" && <p className="notice notice-error">{errorMsg}</p>}

      {showEventForm && canScheduleCategory && (
        <div className="event-form">
          {!hasCalendarScope ? (
            <div className="event-form-connect">
              <p className="notice">Connect your calendar to schedule this.</p>
              <ConnectCalendarButton />
            </div>
          ) : eventState === "saved" ? (
            <p className="notice">Added to your calendar.</p>
          ) : (
            <>
              {email.suggestedEvent && (
                <p className="notice notice-suggestion">
                  Pre-filled from a date found in this email — double-check it before saving.
                </p>
              )}
              <label className="event-field">
                Title
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="event-field">
                Starts
                <input
                  type="datetime-local"
                  value={times.start}
                  onChange={(e) => setTimes((t) => ({ ...t, start: e.target.value }))}
                />
              </label>
              <label className="event-field">
                Ends
                <input
                  type="datetime-local"
                  value={times.end}
                  onChange={(e) => setTimes((t) => ({ ...t, end: e.target.value }))}
                />
              </label>
              <button className="btn-primary btn-small" onClick={handleAddToCalendar} disabled={eventState === "saving"}>
                {eventState === "saving" ? "Saving…" : "Save to calendar"}
              </button>
              {eventState === "error" && <p className="notice notice-error">{eventError}</p>}
            </>
          )}
        </div>
      )}
    </li>
  );
}
