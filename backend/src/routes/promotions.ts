import { Router } from "express";

import { createAdminPromotion, deleteAdminPromotion, listAdminPromotions, listHomepagePromotions, updateAdminPromotion } from "../controllers/promotionsController";
import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";

export function promotionsRouter() {
  const router = Router();

  router.get("/promotions/homepage", asyncHandler(listHomepagePromotions));
  router.get("/promotions/admin", authenticate, asyncHandler(listAdminPromotions));
  router.post("/promotions/admin", authenticate, asyncHandler(createAdminPromotion));
  router.put("/promotions/admin/:id", authenticate, asyncHandler(updateAdminPromotion));
  router.delete("/promotions/admin/:id", authenticate, asyncHandler(deleteAdminPromotion));

  return router;
}