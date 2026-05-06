import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { claimAirdrop } from "../controllers/airdropController";

export function airdropRouter() {
  const router = Router();
  router.post("/airdrop/claim", asyncHandler(claimAirdrop));
  return router;
}
