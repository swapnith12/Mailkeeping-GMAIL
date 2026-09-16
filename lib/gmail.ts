const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  snippet: string;
}

class GmailAuthError extends Error {
  constructor() {
    super("Gmail rejected the access token (expired or revoked)");
    this.name = "GmailAuthError";
  }
}

async function gmailGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) throw new GmailAuthError();
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }

  return res.json();
}

// Gmail caps each page of this endpoint well below most scan limits, so
// anything past the free tier's 100 needs multiple requests.
const GMAIL_PAGE_SIZE = 100;

/**
 * Lists the IDs of the user's most recent messages, newest first, paging
 * through Gmail's list endpoint until `maxResults` is reached or the
 * mailbox runs out. `maxResults` is where both the free-tier cap and the
 * paid-tier cap get enforced — a hard ceiling passed to Gmail, not a
 * client-side filter.
 */
export async function listMessageIds(
  accessToken: string,
  maxResults: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const remaining = maxResults - ids.length;
    if (remaining <= 0) break;

    const params = new URLSearchParams({
      maxResults: String(Math.min(GMAIL_PAGE_SIZE, remaining)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await gmailGet(`/messages?${params.toString()}`, accessToken);
    ids.push(...(data.messages ?? []).map((m: { id: string }) => m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return ids;
}

/** Fetches just subject/from/snippet for one message — enough to classify without reading full bodies. */
export async function getMessageSummary(
  accessToken: string,
  id: string
): Promise<GmailMessageSummary> {
  const data = await gmailGet(
    `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
    accessToken
  );

  const headers: { name: string; value: string }[] = data.payload?.headers ?? [];
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
  const from = headers.find((h) => h.name === "From")?.value ?? "(unknown sender)";

  return { id, subject, from, snippet: data.snippet ?? "" };
}

/**
 * Fetches summaries for many messages, in small parallel batches so we don't
 * fire 100 simultaneous requests at Gmail (and trip its per-user rate limit).
 */
export async function getMessageSummaries(
  accessToken: string,
  ids: string[]
): Promise<GmailMessageSummary[]> {
  const CHUNK_SIZE = 10;
  const results: GmailMessageSummary[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map((id) => getMessageSummary(accessToken, id))
    );
    results.push(...chunkResults);
  }

  return results;
}

export { GmailAuthError };

/**
 * Moves a message to Trash (Gmail's TRASH label) — our stand-in for
 * "delete". Non-destructive in the sense that Trash auto-expires after 30
 * days rather than purging immediately, giving users a safety net if the
 * UI's confirmation step gets clicked through in error.
 */
export async function trashMessage(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${GMAIL_BASE}/messages/${id}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) throw new GmailAuthError();
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
}
