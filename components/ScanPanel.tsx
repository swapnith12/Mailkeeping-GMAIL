"use client";

import { useState } from "react";
import type { Category } from "@/lib/types";
import type { ScannedEmail } from "@/lib/classify";
import EmailRow from "@/components/EmailRow";

const CATEGORY_LABELS: Record<Category, string> = {
  spam: "Spam",
  promotions: "Promotions",
  bills: "Bills",
  important: "Important",
  misc: "Misc",
};

// Categories worth offering "Add to calendar" on — things with a plausible
// date/deadline attached. Spam/promotions/misc don't get the option.
const SCHEDULABLE_CATEGORIES = new Set<Category>(["bills", "important"]);

type ScanState = "idle" | "loading" | "done" | "error";

interface ScanPanelProps {
  subscribed: boolean;
  hasCalendarScope: boolean;
}

export default function ScanPanel({ subscribed, hasCalendarScope }: ScanPanelProps) {
  const [state, setState] = useState<ScanState>("idle");
  const [counts, setCounts] = useState<Record<Category, number> | null>(null);
  const [emails, setEmails] = useState<ScannedEmail[]>([]);
  const [scanned, setScanned] = useState(0);
  const [limit, setLimit] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [quotaLine, setQuotaLine] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<Category | null>(null);

  async function runScan() {
    setState("loading");
    setErrorMsg("");
    setExpandedCategory(null);
    try {
      const res = await fetch("/api/scan");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setCounts(data.counts);
      setEmails(data.emails ?? []);
      setScanned(data.scanned);
      setLimit(data.limit);
      setCacheHits(data.cacheHits ?? 0);
      setQuotaLine(
        data.scansPerDay
          ? `${data.scansUsedToday} of ${data.scansPerDay} free scans used today`
          : "Unlimited scans (Pro)"
      );
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  function toggleCategory(key: Category) {
    setExpandedCategory((current) => (current === key ? null : key));
  }

  const visibleEmails = expandedCategory ? emails.filter((e) => e.category === expandedCategory) : [];

  return (
    <div className="card">
      <div className="card-header-row">
        <h3>Categories</h3>
        <button className="btn-primary" onClick={runScan} disabled={state === "loading"}>
          {state === "loading" ? "Scanning…" : "Scan inbox"}
        </button>
      </div>

      <div className="category-grid">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((key) => (
          <button
            className={`category-cell${expandedCategory === key ? " category-cell-active" : ""}`}
            key={key}
            onClick={() => counts && counts[key] > 0 && toggleCategory(key)}
            disabled={!counts || counts[key] === 0}
          >
            <span className="count">{counts ? counts[key] : "–"}</span>
            <span className="label">{CATEGORY_LABELS[key]}</span>
          </button>
        ))}
      </div>

      {expandedCategory && (
        <ul className="email-list">
          {visibleEmails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              subscribed={subscribed}
              hasCalendarScope={hasCalendarScope}
              canScheduleCategory={SCHEDULABLE_CATEGORIES.has(email.category)}
            />
          ))}
        </ul>
      )}

      {state === "idle" && (
        <p className="notice">
          Click "Scan inbox" to fetch and classify your most recent emails.
          {!subscribed && " Free tier: 100 emails per scan, 3 scans/day."}
        </p>
      )}
      {state === "done" && (
        <p className="notice">
          Scanned {scanned} of your most recent emails (cap: {limit}
          {cacheHits > 0 ? `, ${cacheHits} from cache` : ""}). {quotaLine}.
          {counts && Object.values(counts).some((c) => c > 0) && " Click a category to see and act on its emails."}
        </p>
      )}
      {state === "error" && <p className="notice notice-error">{errorMsg}</p>}
    </div>
  );
}
