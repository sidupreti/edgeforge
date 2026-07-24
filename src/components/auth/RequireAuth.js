import React from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

// Gates a route behind sign-in. Both the pipeline (/app) and the optimizer (/optimize)
// require an account — every visit that starts real work is a captured lead.
export default function RequireAuth({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) return null; // Clerk still resolving the session — avoid a sign-in flash.
  if (!isSignedIn) {
    return <Navigate to="/sign-up" state={{ from: location }} replace />;
  }
  return children;
}
