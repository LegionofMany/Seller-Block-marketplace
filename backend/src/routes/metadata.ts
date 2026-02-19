import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { getMetadataById, uploadMetadata } from "../controllers/metadataController";

export function metadataRouter() {
  const router = Router();
  router.post("/metadata", asyncHandler(uploadMetadata));
  router.get("/metadata/:id", asyncHandler(getMetadataById));
  return router;
}
