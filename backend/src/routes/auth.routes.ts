import { Router } from "express";
import { forgotPassword, login, logout, refresh, register, resetPassword } from "../controllers/auth.controller";
import { authRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", authRateLimit, register);
authRouter.post("/login", authRateLimit, login);
authRouter.post("/refresh", authRateLimit, refresh);
authRouter.post("/logout", requireAuth, logout);
authRouter.post("/forgot-password", authRateLimit, forgotPassword);
authRouter.post("/reset-password", authRateLimit, resetPassword);
