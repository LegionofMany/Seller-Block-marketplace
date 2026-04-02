import { Router } from "express";

import { authenticate } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async";
import { getNotifications, readAllNotifications, readNotification } from "../controllers/notificationsController";

export function notificationsRouter() {
  const router = Router();

  router.get("/notifications", authenticate, asyncHandler(getNotifications));
  router.post("/notifications/read-all", authenticate, asyncHandler(readAllNotifications));
  router.post("/notifications/:id/read", authenticate, asyncHandler(readNotification));

  return router;
}