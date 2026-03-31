import { Router } from "express";
import rateLimit from "express-rate-limit";

import { asyncHandler } from "../middlewares/async";
import { authenticate } from "../middlewares/auth";
import { getConversations, getMessages, sendMessageToConversation, startConversation } from "../controllers/messagesController";

export function messagesRouter() {
  const router = Router();
  const writeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use(authenticate);

  router.get("/messages/conversations", asyncHandler(getConversations));
  router.post("/messages/conversations", writeLimiter, asyncHandler(startConversation));
  router.get("/messages/conversations/:id/messages", asyncHandler(getMessages));
  router.post("/messages/conversations/:id/messages", writeLimiter, asyncHandler(sendMessageToConversation));

  return router;
}