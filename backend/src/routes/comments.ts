import { Router } from "express";
import rateLimit from "express-rate-limit";

import { createComment, getListingComments } from "../controllers/commentsController";
import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";

export function commentsRouter() {
  const router = Router();
  const writeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get("/listings/:id/comments", asyncHandler(getListingComments));
  router.post("/listings/:id/comments", authenticate, writeLimiter, asyncHandler(createComment));

  return router;
}
