import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { uploadMetadata } from "../controllers/metadataController";

export function metadataRouter() {
  const router = Router();
  router.post("/metadata", asyncHandler(uploadMetadata));
  return router;
}
