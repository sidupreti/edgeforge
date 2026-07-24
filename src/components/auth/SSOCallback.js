import React from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";

// Lands here after Google OAuth redirects back; Clerk finishes the session then
// redirects to redirectUrlComplete ("/app") set on the initiating page.
export default function SSOCallback() {
  return <AuthenticateWithRedirectCallback />;
}
