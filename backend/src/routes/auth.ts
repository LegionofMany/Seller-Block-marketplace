import { Router } from "express";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { getMe, issueNonce, issueWalletLinkNonce, loginWithEmail, registerWithEmail, unlinkWallet, verifyNonce, verifyWalletLink } from "../controllers/authController";

export function authRouter() {
  const router = Router();

  router.post("/auth/nonce", asyncHandler(issueNonce));
  router.post("/auth/verify", asyncHandler(verifyNonce));
  router.post("/auth/email/register", asyncHandler(registerWithEmail));
  router.post("/auth/email/login", asyncHandler(loginWithEmail));
  router.get("/auth/me", authenticate, asyncHandler(getMe));
  router.post("/auth/link-wallet/nonce", authenticate, asyncHandler(issueWalletLinkNonce));
  router.post("/auth/link-wallet/verify", authenticate, asyncHandler(verifyWalletLink));
  router.post("/auth/link-wallet/unlink", authenticate, asyncHandler(unlinkWallet));

  return router;
}