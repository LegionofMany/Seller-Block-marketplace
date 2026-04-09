import { Router } from "express";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import {
  getLatestSellerOrder,
  prepareBuyerAcceptance,
  prepareConfirmDelivery,
  prepareRequestRefund,
  prepareSellerOrder,
  publishSellerOrder,
  relayAccept,
  relayConfirm,
  relayRefund,
} from "../controllers/settlementController";

export function settlementRouter() {
  const router = Router();

  router.get("/listings/:id/settlement/order", asyncHandler(getLatestSellerOrder));
  router.post("/listings/:id/settlement/order/prepare", authenticate, asyncHandler(prepareSellerOrder));
  router.post("/listings/:id/settlement/order", authenticate, asyncHandler(publishSellerOrder));
  router.post("/listings/:id/settlement/acceptance/prepare", authenticate, asyncHandler(prepareBuyerAcceptance));
  router.post("/listings/:id/settlement/accept", authenticate, asyncHandler(relayAccept));
  router.post("/listings/:id/settlement/confirm/prepare", authenticate, asyncHandler(prepareConfirmDelivery));
  router.post("/listings/:id/settlement/confirm", authenticate, asyncHandler(relayConfirm));
  router.post("/listings/:id/settlement/refund/prepare", authenticate, asyncHandler(prepareRequestRefund));
  router.post("/listings/:id/settlement/refund", authenticate, asyncHandler(relayRefund));

  return router;
}