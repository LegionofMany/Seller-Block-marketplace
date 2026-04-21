import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { createListingView, getListingById, getListings, getListingsBySeller, getMostViewedListings } from "../controllers/listingsController";

export function listingsRouter() {
  const router = Router();

  router.get("/listings", asyncHandler(getListings));
  router.get("/listings/most-viewed", asyncHandler(getMostViewedListings));
  router.get("/listings/:id", asyncHandler(getListingById));
  router.post("/listings/:id/views", asyncHandler(createListingView));
  router.get("/seller/:address/listings", asyncHandler(getListingsBySeller));

  return router;
}
