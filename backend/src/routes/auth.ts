import { Router } from "express";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { getMe, issueNonce, verifyNonce } from "../controllers/authController";

export function authRouter() {
  const router = Router();

  router.post("/auth/nonce", asyncHandler(issueNonce));
  router.post("/auth/verify", asyncHandler(verifyNonce));
  router.get("/auth/me", authenticate, asyncHandler(getMe));

  return router;
}