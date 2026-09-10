import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "@nexus/shared-types";

export interface AuthUser extends PublicUser {}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Authentication has been removed from NEXUS-COMPLY. Every request runs as a
 * single built-in reviewer identity so the human-in-the-loop review flow and
 * the audit trail keep working without a sign-in screen.
 */
export const SYSTEM_REVIEWER: AuthUser = {
  id: "usr-system-reviewer",
  email: "reviewer@nexus-comply.sih",
  displayName: "Security Review Lead",
  role: "reviewer",
};

/** Attaches the system reviewer to every /api request. */
export function attachSystemUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.user = SYSTEM_REVIEWER;
  next();
}

export function toPublicUser(user: AuthUser): AuthUser {
  return user;
}