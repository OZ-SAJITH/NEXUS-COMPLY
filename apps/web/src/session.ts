export type SessionRole = "analyst" | "reviewer";

/**
 * Authentication is removed from NEXUS-COMPLY: every session is the built-in
 * Security Review Lead, so the human-in-the-loop review flow is always usable.
 */

export function isSignedIn(): boolean {
  return true;
}

export function setSession(): void {
  /* no-op — authentication removed */
}

export function signOut(): void {
  /* no-op — authentication removed */
}

export function sessionToken(): string | null {
  return null;
}

export function sessionRole(): SessionRole {
  return "reviewer";
}

export function currentUser(): string {
  return "Security Review Lead";
}