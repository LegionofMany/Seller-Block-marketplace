import { Router } from "express";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { followUser, getFollowState, getUserProfile, unfollowUser, updateMyProfile } from "../controllers/usersController";

export function usersRouter() {
  const router = Router();

  router.get("/users/:address", asyncHandler(getUserProfile));
  router.get("/users/:address/follow-state", authenticate, asyncHandler(getFollowState));
  router.post("/users/:address/follow", authenticate, asyncHandler(followUser));
  router.delete("/users/:address/follow", authenticate, asyncHandler(unfollowUser));
  router.put("/users/me", authenticate, asyncHandler(updateMyProfile));

  return router;
}