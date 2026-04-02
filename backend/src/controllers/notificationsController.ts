import type { Request, Response } from "express";

import { requireAuthAddress } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { countUnreadNotifications, listNotificationsByUser, markAllNotificationsRead, markNotificationRead } from "../services/db";

export async function getNotifications(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const unreadOnly = req.query.unreadOnly === "true";
  const [items, unreadCount] = await Promise.all([
    listNotificationsByUser(db, address, { limit, unreadOnly }),
    countUnreadNotifications(db, address),
  ]);
  return res.json({ items, unreadCount });
}

export async function readNotification(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, "Invalid notification id", "INVALID_NOTIFICATION_ID");

  const ok = await markNotificationRead(db, id, address, Date.now());
  if (!ok) throw new HttpError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
  return res.json({ ok: true });
}

export async function readAllNotifications(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  await markAllNotificationsRead(db, address, Date.now());
  return res.json({ ok: true });
}