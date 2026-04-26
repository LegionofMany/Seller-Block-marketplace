import { Router } from "express";

import {
  approveAdminPromotion,
  createAdminPromotion,
  createSellerPromotionRequest,
  deleteAdminPromotion,
  pauseAdminPromotion,
  rejectAdminPromotion,
  listAdminPromotions,
  listHomepagePromotions,
  listSellerPromotionOverview,
  updateAdminPromotion,
} from "../controllers/promotionsController";
import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";

export function promotionsRouter() {
  const router = Router();

  router.get("/promotions/homepage", asyncHandler(listHomepagePromotions));
  router.get("/promotions/self-serve", authenticate, asyncHandler(listSellerPromotionOverview));
  router.post("/promotions/self-serve/request", authenticate, asyncHandler(createSellerPromotionRequest));
  router.get("/promotions/admin", authenticate, asyncHandler(listAdminPromotions));
  router.post("/promotions/admin", authenticate, asyncHandler(createAdminPromotion));
  router.post("/promotions/admin/:id/approve", authenticate, asyncHandler(approveAdminPromotion));
  router.post("/promotions/admin/:id/reject", authenticate, asyncHandler(rejectAdminPromotion));
  router.post("/promotions/admin/:id/pause", authenticate, asyncHandler(pauseAdminPromotion));
  router.put("/promotions/admin/:id", authenticate, asyncHandler(updateAdminPromotion));
  router.delete("/promotions/admin/:id", authenticate, asyncHandler(deleteAdminPromotion));

  return router;
}