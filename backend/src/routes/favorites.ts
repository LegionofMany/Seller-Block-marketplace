import { Router } from "express";

import { addFavoriteListing, getFavoriteListingState, listMyFavoriteListings, removeFavoriteListing } from "../controllers/favoritesController";
import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";

export function favoritesRouter() {
  const router = Router();

  router.get("/favorites/listings", authenticate, asyncHandler(listMyFavoriteListings));
  router.get("/favorites/listings/:listingId/state", authenticate, asyncHandler(getFavoriteListingState));
  router.post("/favorites/listings", authenticate, asyncHandler(addFavoriteListing));
  router.delete("/favorites/listings/:listingId", authenticate, asyncHandler(removeFavoriteListing));

  return router;
}