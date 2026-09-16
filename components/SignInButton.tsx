"use client";

import { signIn } from "next-auth/react";

export default function SignInButton() {
  return (
    <button className="btn-primary" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
      Continue with Google
    </button>
  );
}
