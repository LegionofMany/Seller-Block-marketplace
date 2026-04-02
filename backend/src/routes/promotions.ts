import { Router } from "express";

import { authenticate } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async";
import { confirmPromotionCheckoutSession, createPromotionCheckoutSession, getMyPromotionData, getPromotionOptions } from "../controllers/promotionsController";

export function promotionsRouter() {
  const router = Router();

  router.get("/promotions/options", asyncHandler(getPromotionOptions));
  router.get("/promotions/me", authenticate, asyncHandler(getMyPromotionData));
  router.post("/promotions/checkout-session", authenticate, asyncHandler(createPromotionCheckoutSession));
  router.post("/promotions/confirm-session", authenticate, asyncHandler(confirmPromotionCheckoutSession));

  return router;
}