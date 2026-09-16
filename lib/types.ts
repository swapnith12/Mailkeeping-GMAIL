export type Category = "spam" | "promotions" | "bills" | "important" | "misc";

export const CATEGORIES: Category[] = ["spam", "promotions", "bills", "important", "misc"];

/** An agent-proposed calendar event, built from a deadline/date it found in the email — never created without the user reviewing and confirming it in the UI. */
export interface SuggestedEvent {
  summary: string;
  /** ISO 8601 datetime */
  start: string;
  /** ISO 8601 datetime, after start */
  end: string;
}

export interface ClassifiedEmail {
  id: string;
  category: Category;
  /** Paid-tier only. Present when the agent found a concrete date/deadline worth scheduling. */
  suggestedEvent?: SuggestedEvent | null;
  /** Paid-tier only. True when the agent thinks this is safe to delete (e.g. spam) — still requires manual confirm. */
  recommendedDelete?: boolean;
}
