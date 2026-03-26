import { Router } from "express";
import multer from "multer";

import { asyncHandler } from "../middlewares/async";
import { uploadImages } from "../controllers/uploadsController";

export function uploadsRouter() {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 6 * 1024 * 1024, // 6MB
      files: 12,
    },
  });

  router.post("/uploads/images", upload.array("files", 12), asyncHandler(uploadImages));

  return router;
}
