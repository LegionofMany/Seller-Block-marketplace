import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { getListingById, getListings, getListingsBySeller } from "../controllers/listingsController";

export function listingsRouter() {
  const router = Router();

  router.get("/listings", asyncHandler(getListings));
  router.get("/listings/:id", asyncHandler(getListingById));
  router.get("/seller/:address/listings", asyncHandler(getListingsBySeller));

  return router;
}
