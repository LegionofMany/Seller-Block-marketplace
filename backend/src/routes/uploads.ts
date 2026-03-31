import { Router } from "express";
import multer from "multer";

import { asyncHandler } from "../middlewares/async";
import { HttpError } from "../middlewares/errors";
import { uploadImages } from "../controllers/uploadsController";

export function uploadsRouter() {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 6 * 1024 * 1024, // 6MB
      files: 12,
    },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype?.startsWith("image/")) {
        cb(null, true);
        return;
      }

      cb(new HttpError(400, "Only image uploads are allowed", "INVALID_UPLOAD_TYPE"));
    },
  });

  router.post("/uploads/images", upload.array("files", 12), asyncHandler(uploadImages));

  return router;
}
