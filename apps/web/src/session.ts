const KEY = "nexus-comply.session";
const TOKEN_KEY = "nexus-comply.token";
const USER_KEY = "nexus-comply.user";
const ROLE_KEY = "nexus-comply.role";

export type SessionRole = "analyst" | "reviewer";

export interface SessionUser {
  token: string;
  id: string;
  email: string;
  displayName: string;
  role: SessionRole;
}

export function isSignedIn(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY) && localStorage.getItem(TOKEN_KEY));
  } catch {
    return false;
  }
}

export function setSession(user: SessionUser): void {
  try {
    localStorage.setItem(KEY, "1");
    localStorage.setItem(TOKEN_KEY, user.token);
    localStorage.setItem(USER_KEY, user.displayName);
    localStorage.setItem(ROLE_KEY, user.role);
  } catch {
    /* storage unavailable */
  }
}

export function signOut(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function sessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function sessionRole(): SessionRole {
  try {
    return (localStorage.getItem(ROLE_KEY) as SessionRole | null) ?? "analyst";
  } catch {
    return "analyst";
  }
}

export function currentUser(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? "Security Analyst";
  } catch {
    return "Security Analyst";
  }
}