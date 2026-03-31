import { Router } from "express";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { getUserProfile, updateMyProfile } from "../controllers/usersController";

export function usersRouter() {
  const router = Router();

  router.get("/users/:address", asyncHandler(getUserProfile));
  router.put("/users/me", authenticate, asyncHandler(updateMyProfile));

  return router;
}