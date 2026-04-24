import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async";
import { createListingView, deleteListingAction, getListingById, getListings, getListingsBySeller, getMostViewedListings } from "../controllers/listingsController";

export function listingsRouter() {
  const router = Router();

  router.get("/listings", asyncHandler(getListings));
  router.get("/listings/most-viewed", asyncHandler(getMostViewedListings));
  router.get("/listings/:id", asyncHandler(getListingById));
  router.delete("/listings/:id", authenticate, asyncHandler(deleteListingAction));
  router.post("/listings/:id/views", asyncHandler(createListingView));
  router.get("/seller/:address/listings", asyncHandler(getListingsBySeller));

  return router;
}
