import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { PublicUser, UserRecord, UserRole } from "@nexus/shared-types";
import { getRepository } from "../storage/jsonRepo";
import { uniqueId } from "../utils/helpers";

const HASH_LEN = 64;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.AUTH_SECRET ?? "nexus-comply-dev-secret-change-in-production";
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, HASH_LEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, HASH_LEN);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export interface TokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  displayName: string;
  iat: number;
  exp: number;
}

export function signToken(user: UserRecord): string {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as TokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface AuthUser extends PublicUser {}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function attachUser(req: Request): AuthUser | null {
  const token = bearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, displayName: payload.displayName, role: payload.role };
}

/** Optional auth: attaches req.user when a valid token is present, never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = attachUser(req);
  if (user) req.user = user;
  next();
}

/** Required auth: rejects requests that are anonymous or carry an invalid token. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = attachUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required. Sign in to access this resource." });
    return;
  }
  req.user = user;
  next();
}

/** Reviewer-gated: reviewers can decide on findings and finalize reviews. */
export function requireReviewer(req: Request, res: Response, next: NextFunction): void {
  const user = attachUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required. Sign in to access this resource." });
    return;
  }
  if (user.role !== "reviewer") {
    res.status(403).json({ error: "Authorization required. Only Security Reviewers may perform this action." });
    return;
  }
  req.user = user;
  next();
}

export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

/** Demo reviewer/analyst identities created only when the database has no users yet. */
export async function ensureDemoUsers(): Promise<void> {
  const repo = getRepository();
  const existing = await repo.allUsers();
  if (existing.length > 0) return;

  const seeded = [
    {
      email: "analyst@nexus-comply.sih",
      displayName: "Security Analyst",
      role: "analyst" as UserRole,
      password: "demo-analyst",
    },
    {
      email: "reviewer@nexus-comply.sih",
      displayName: "Security Review Lead",
      role: "reviewer" as UserRole,
      password: "demo-reviewer",
    },
  ];

  for (const u of seeded) {
    const { hash, salt } = hashPassword(u.password);
    await repo.saveUser({
      id: uniqueId("usr"),
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    });
  }
  console.log("[nexus-api] seeded demo users (Security Analyst / Security Review Lead) for the human-in-the-loop workflow.");
}