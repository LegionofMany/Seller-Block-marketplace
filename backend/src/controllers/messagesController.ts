import type { Request, Response } from "express";
import { z } from "zod";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import {
  addConversationParticipant,
  createConversation,
  createMessage,
  ensureUser,
  findConversationByParticipants,
  getConversation,
  hasUserBlockBetween,
  listConversationMessages,
  listConversationParticipants,
  listUserConversations,
  touchConversation,
} from "../services/db";
import { parseLimitOffset, requireAddress, requireBytes32 } from "../utils/validation";

function normalizeMessageBody(value: string): string {
  const body = value.trim();
  if (!body) throw new HttpError(400, "Message body is required", "INVALID_MESSAGE_BODY");
  if (body.length > 2000) throw new HttpError(400, "Message body is too long", "INVALID_MESSAGE_BODY");
  if (/[<>]/.test(body)) throw new HttpError(400, "Message body contains invalid characters", "INVALID_MESSAGE_BODY");
  return body;
}

function requireConversationId(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, "Invalid conversation id", "INVALID_CONVERSATION_ID");
  }
  return Math.trunc(parsed);
}

async function assertConversationAccess(conversationId: number, address: string) {
  const { db } = getContext();
  const conversation = await getConversation(db, conversationId);
  if (!conversation) throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  const participants = await listConversationParticipants(db, conversationId);
  if (!participants.some((p) => p.toLowerCase() === address.toLowerCase())) {
    throw new HttpError(403, "You are not a participant in this conversation", "FORBIDDEN_CONVERSATION");
  }
  return { conversation, participants };
}

export async function startConversation(req: Request, res: Response) {
  const address = requireAuthAddress(req);
  const parsed = z.object({
    counterparty: z.string().min(1),
    listingId: z.string().optional(),
    body: z.string().min(1).max(2000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid conversation payload", "INVALID_CONVERSATION");

  const { db } = getContext();
  const counterparty = requireAddress(parsed.data.counterparty, "counterparty");
  if (counterparty.toLowerCase() === address.toLowerCase()) {
    throw new HttpError(400, "You cannot message yourself", "INVALID_CONVERSATION");
  }

  if (await hasUserBlockBetween(db, address, counterparty)) {
    throw new HttpError(403, "Messaging is unavailable because one user has blocked the other", "BLOCKED_CONVERSATION");
  }

  const listingId = parsed.data.listingId?.trim() ? requireBytes32(parsed.data.listingId.trim(), "listing id") : null;
  const body = parsed.data.body?.trim() ? normalizeMessageBody(parsed.data.body) : null;
  const now = Date.now();

  await ensureUser(db, address, now);
  await ensureUser(db, counterparty, now);

  let conversation = await findConversationByParticipants(db, address, counterparty, listingId);
  if (!conversation) {
    conversation = await createConversation(db, {
      listingId,
      createdBy: address,
      createdAt: now,
      updatedAt: now,
    });
    await addConversationParticipant(db, conversation.id, address, now);
    await addConversationParticipant(db, conversation.id, counterparty, now);
  }

  let message = null;
  if (body) {
    message = await createMessage(db, {
      conversationId: conversation.id,
      sender: address,
      body,
      createdAt: now,
    });
    await touchConversation(db, conversation.id, now);
  }

  return res.status(201).json({ conversation, ...(message ? { message } : {}) });
}

export async function getConversations(req: Request, res: Response) {
  const address = requireAuthAddress(req);
  const { db } = getContext();
  const items = await listUserConversations(db, address);
  return res.json({ items });
}

export async function getMessages(req: Request, res: Response) {
  const address = requireAuthAddress(req);
  const { db } = getContext();
  const conversationId = requireConversationId(String(req.params.id ?? ""));
  const { participants } = await assertConversationAccess(conversationId, address);

  const { limit } = parseLimitOffset(req.query);
  const beforeId = typeof req.query.beforeId === "string" ? Number(req.query.beforeId) : undefined;
  const since = typeof req.query.since === "string" ? Number(req.query.since) : undefined;

  const items = await listConversationMessages(db, conversationId, {
    limit,
    ...(Number.isFinite(beforeId) ? { beforeId } : {}),
    ...(Number.isFinite(since) ? { since } : {}),
  });

  return res.json({ items, participants });
}

export async function sendMessageToConversation(req: Request, res: Response) {
  const address = requireAuthAddress(req);
  const { db } = getContext();
  const conversationId = requireConversationId(String(req.params.id ?? ""));
  const { participants } = await assertConversationAccess(conversationId, address);

  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid message payload", "INVALID_MESSAGE_BODY");

  const body = normalizeMessageBody(parsed.data.body);
  for (const participant of participants) {
    if (participant.toLowerCase() === address.toLowerCase()) continue;
    if (await hasUserBlockBetween(db, address, participant)) {
      throw new HttpError(403, "Messaging is unavailable because one user has blocked the other", "BLOCKED_CONVERSATION");
    }
  }

  const now = Date.now();
  const item = await createMessage(db, {
    conversationId,
    sender: address,
    body,
    createdAt: now,
  });
  await touchConversation(db, conversationId, now);
  return res.status(201).json({ item });
}