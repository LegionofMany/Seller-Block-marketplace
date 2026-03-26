import { Router } from "express";
import { asyncHandler } from "../middlewares/async";
import { getMetadataById, getMetadataByUriHandler, uploadMetadata, uploadMetadataIpfs } from "../controllers/metadataController";

export function metadataRouter() {
  const router = Router();
  router.post("/metadata", asyncHandler(uploadMetadata));
  router.post("/metadata/ipfs", asyncHandler(uploadMetadataIpfs));
  router.get("/metadata/lookup", asyncHandler(getMetadataByUriHandler));
  router.get("/metadata/:id", asyncHandler(getMetadataById));
  return router;
}
