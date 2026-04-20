import { Router } from "express";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { followUser, getAdminTrustSummary, getFollowState, getMyFollowedUsers, getUserProfile, unfollowUser, updateMyProfile, updateUserTrustAction } from "../controllers/usersController";

export function usersRouter() {
  const router = Router();

  router.get("/users/admin/trust", authenticate, asyncHandler(getAdminTrustSummary));
  router.get("/users/:address", asyncHandler(getUserProfile));
  router.get("/users/me/follows", authenticate, asyncHandler(getMyFollowedUsers));
  router.get("/users/:address/follow-state", authenticate, asyncHandler(getFollowState));
  router.post("/users/:address/follow", authenticate, asyncHandler(followUser));
  router.delete("/users/:address/follow", authenticate, asyncHandler(unfollowUser));
  router.put("/users/me", authenticate, asyncHandler(updateMyProfile));
  router.put("/users/:address/trust", authenticate, asyncHandler(updateUserTrustAction));

  return router;
}