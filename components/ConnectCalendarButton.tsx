"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { FULL_SCOPES } from "@/lib/scopes";

export default function ConnectCalendarButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      className="btn-ghost"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        // Re-runs the Google OAuth flow with Gmail + Calendar scopes.
        // include_granted_scopes=true means this adds Calendar on top of
        // what's already granted rather than starting over.
        signIn(
          "google",
          { callbackUrl: "/dashboard" },
          {
            scope: FULL_SCOPES,
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
          }
        );
      }}
    >
      {loading ? "Connecting…" : "Connect calendar"}
    </button>
  );
}
