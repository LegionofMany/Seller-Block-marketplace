import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { getAuctionByListingId } from "../controllers/auctionsController";

export function auctionsRouter() {
  const router = Router();
  router.get("/auctions/:listingId", asyncHandler(getAuctionByListingId));
  return router;
}
