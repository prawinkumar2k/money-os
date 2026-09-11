import { Request, Response } from "express";
import { z } from "zod";
import { User } from "../models/User";
import { AuditLog } from "../models/AuditLog";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";
import {
  compareToken,
  generateRandomToken,
  hashPassword,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from "../services/auth.service";
import { AuthedRequest } from "../middleware/auth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function issueTokens(user: { _id: unknown; email: string }) {
  const payload = { sub: String(user._id), email: user.email };
  return { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);

  const existing = await User.findOne({ email: body.email });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(body.password);
  const user = await User.create({ email: body.email, passwordHash, name: body.name });

  const tokens = issueTokens(user);
  user.refreshTokenHash = await hashToken(tokens.refreshToken);
  await user.save();

  await AuditLog.create({ userId: user._id, action: "auth.register", metadata: {}, ip: req.ip ?? null });

  res.status(201).json({
    user: { id: user._id, email: user.email, name: user.name },
    ...tokens,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);

  const user = await User.findOne({ email: body.email }).select("+refreshTokenHash +passwordHash");
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const tokens = issueTokens(user);
  user.refreshTokenHash = await hashToken(tokens.refreshToken);
  await user.save();

  await AuditLog.create({ userId: user._id, action: "auth.login", metadata: {}, ip: req.ip ?? null });

  res.json({
    user: { id: user._id, email: user.email, name: user.name },
    ...tokens,
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.parse(req.body);

  let payload;
  try {
    payload = verifyRefreshToken(body.refreshToken);
  } catch {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(payload.sub).select("+refreshTokenHash");
  if (!user?.refreshTokenHash || !(await compareToken(body.refreshToken, user.refreshTokenHash))) {
    throw new HttpError(401, "Refresh token is no longer valid");
  }

  const tokens = issueTokens(user);
  user.refreshTokenHash = await hashToken(tokens.refreshToken); // rotate
  await user.save();

  res.json(tokens);
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotPasswordSchema.parse(req.body);

  const user = await User.findOne({ email: body.email });

  // Always respond the same way whether or not the account exists, so this endpoint can't be
  // used to enumerate registered emails.
  const response: { message: string; resetToken?: string } = {
    message: "If an account exists for this email, a reset link has been sent.",
  };

  if (user) {
    const rawToken = generateRandomToken();
    user.resetTokenHash = hashToken(rawToken);
    user.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    await AuditLog.create({ userId: user._id, action: "auth.forgot_password", metadata: {}, ip: req.ip ?? null });

    // No email provider is configured yet (a real one — SendGrid/SES/etc. — is an external
    // dependency to wire up later). In development the raw token is returned directly so the
    // reset flow is actually testable end-to-end; production never echoes it back.
    if (env.NODE_ENV !== "production") {
      response.resetToken = rawToken;
    }
  }

  res.json(response);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = resetPasswordSchema.parse(req.body);
  const tokenHash = hashToken(body.token);

  const user = await User.findOne({ resetTokenHash: tokenHash }).select(
    "+resetTokenHash +resetTokenExpiresAt +refreshTokenHash"
  );

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "Reset link is invalid or has expired");
  }

  user.passwordHash = await hashPassword(body.newPassword);
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  user.refreshTokenHash = null; // force re-login on every device
  await user.save();

  await AuditLog.create({ userId: user._id, action: "auth.reset_password", metadata: {}, ip: req.ip ?? null });

  res.json({ message: "Password has been reset. Please log in again." });
});

export const logout = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (req.userId) {
    await User.findByIdAndUpdate(req.userId, { refreshTokenHash: null });
    await AuditLog.create({ userId: req.userId, action: "auth.logout", metadata: {}, ip: req.ip ?? null });
  }
  res.status(204).send();
});
