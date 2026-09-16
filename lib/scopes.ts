// Base scopes requested at initial sign-in, for every account (free and
// subscribed). Deliberately excludes Calendar — free-tier users shouldn't
// be asked to grant it. Subscribed users get it via a separate incremental
// consent step (see CALENDAR_SCOPE / FULL_SCOPES below and
// components/ConnectCalendarButton.tsx).
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
].join(" ");

// Lets us create events on the user's primary calendar. Narrower than the
// full `calendar` scope (no read access to existing events, no ability to
// touch calendars other than primary) — least privilege for what
// "add to calendar" actually needs.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Requested only when a subscribed user clicks "Connect calendar".
// `include_granted_scopes=true` in the auth request (see
// ConnectCalendarButton) means this re-auth adds Calendar on top of the
// Gmail scopes already granted, rather than replacing them.
export const FULL_SCOPES = `${GMAIL_SCOPES} ${CALENDAR_SCOPE}`;
