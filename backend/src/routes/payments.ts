import express from "express";
import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { createEscrowPayment, reviewPayment } from "../controllers/paymentsController";

export function paymentsRouter() {
  const router = express.Router();

  router.post("/payments/escrow", authenticate, asyncHandler(createEscrowPayment));
  router.put("/payments/:id/review", authenticate, asyncHandler(reviewPayment));

  return router;
}
