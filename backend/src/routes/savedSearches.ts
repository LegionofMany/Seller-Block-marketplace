import { Router } from "express";

import { authenticate } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async";
import { createSavedSearchAction, deleteSavedSearchAction, listSavedSearches, updateSavedSearchAction } from "../controllers/savedSearchesController";

export function savedSearchesRouter() {
  const router = Router();

  router.get("/saved-searches", authenticate, asyncHandler(listSavedSearches));
  router.post("/saved-searches", authenticate, asyncHandler(createSavedSearchAction));
  router.put("/saved-searches/:id", authenticate, asyncHandler(updateSavedSearchAction));
  router.delete("/saved-searches/:id", authenticate, asyncHandler(deleteSavedSearchAction));

  return router;
}