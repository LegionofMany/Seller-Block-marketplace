import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { getRaffleByListingId } from "../controllers/rafflesController";

export function rafflesRouter() {
  const router = Router();
  router.get("/raffles/:listingId", asyncHandler(getRaffleByListingId));
  return router;
}
