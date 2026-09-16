import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { GMAIL_SCOPES } from "@/lib/scopes";

// Scopes needed for the features we've designed:
// - gmail.readonly: search and read messages/threads for scanning + classification
// - gmail.modify: apply the TRASH/SPAM system labels (our stand-in for "delete")
// - gmail.labels: create custom labels later (Bills, Schedules/Approve, etc.)
// Calendar scope is deliberately left out of this base set — see
// lib/scopes.ts and ConnectCalendarButton for how subscribed users add it.

// Google access tokens expire after about an hour. Without this, a user who
// signs in and comes back later gets silent 401s from Gmail rather than a
// clean re-auth prompt.
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });

    const refreshed = await res.json();
    if (!res.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Google doesn't always return a new refresh_token — keep the old one if so
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (err) {
    console.error("Failed to refresh Google access token:", err);
    // Surface this on the session so the UI can prompt a re-login
    // rather than retrying with a dead token.
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: GMAIL_SCOPES,
          // offline + consent ensures Google issues a refresh_token every time,
          // not just on the very first authorization
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Runs on initial sign-in AND on the incremental re-auth triggered by
      // ConnectCalendarButton — both populate `account`.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : undefined;
        // providerAccountId is Google's stable `sub` claim — this is what we'll
        // key the free-tier quota ledger on, since it survives cookie clears
        // and browser switches (see the abuse-prevention discussion).
        token.googleSub = account.providerAccountId;
        // account.scope is the space-delimited set Google actually granted
        // for this token — checking it (rather than assuming) is what lets
        // us tell a first-time sign-in apart from one that's already added
        // Calendar via ConnectCalendarButton.
        token.hasCalendarScope = Boolean(account.scope?.includes("calendar"));
        return token;
      }

      // Still valid — nothing to do
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Expired — try to refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.googleSub = token.googleSub;
      session.hasCalendarScope = token.hasCalendarScope;
      session.error = token.error;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
