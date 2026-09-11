import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env";

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  // jti ensures each refresh token is unique even when issued for the same user within the
  // same second, so rotation always invalidates the exact previous token (see hashToken/compareToken).
  return jwt.sign({ ...payload, jti: uuidv4() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AccessTokenPayload;
}

// Refresh tokens are stored hashed (never plaintext) so a DB read alone can't be replayed as a
// token. They're high-entropy JWTs already, so a fast fixed-length digest is used rather than
// bcrypt — bcrypt truncates input at 72 bytes, which would make two tokens for the same user
// (sharing an identical header + sub/email prefix) hash identically regardless of their
// differing jti/signature, defeating rotation.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function compareToken(token: string, hash: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(hashToken(token)), Buffer.from(hash));
}

// Password-reset tokens: same reasoning as refresh tokens — random, high-entropy, so a fast
// digest is used for storage instead of bcrypt.
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
