import { Router } from "express";
import rateLimit from "express-rate-limit";

import { asyncHandler } from "../middlewares/async";
import { blockUser, getBlocks, report } from "../controllers/safetyController";

export function safetyRouter() {
  const router = Router();

  // Stricter limiter for abuse-sensitive endpoints.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get("/safety/blocks", limiter, asyncHandler(getBlocks));
  router.post("/safety/block", limiter, asyncHandler(blockUser));
  router.post("/safety/report", limiter, asyncHandler(report));

  return router;
}
