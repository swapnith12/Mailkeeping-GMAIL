import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    googleSub?: string;
    hasCalendarScope?: boolean;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    googleSub?: string;
    hasCalendarScope?: boolean;
    error?: string;
  }
}
