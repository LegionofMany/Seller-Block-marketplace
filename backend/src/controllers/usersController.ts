import type { Request, Response } from "express";
import { z } from "zod";

import { HttpError } from "../middlewares/errors";
import { requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import { ensureUser, getPublicUserProfile, getUser, updateUserProfile } from "../services/db";
import { requireAddress } from "../utils/validation";

function isAvatarValue(value: string): boolean {
  if (/^ipfs:\/\//i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getUserProfile(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAddress(String(req.params.address ?? ""), "address");
  const profile = await getPublicUserProfile(db, address);
  if (!profile) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  return res.json({
    user: profile.user,
    stats: {
      listingCount: profile.listingCount,
      location: profile.location ?? null,
      followerCount: 0,
      responseRate: null,
      reputation: null,
    },
  });
}

export async function updateMyProfile(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const parsed = z.object({
    displayName: z.string().max(80).optional(),
    bio: z.string().max(1000).optional(),
    avatarCid: z.string().max(2048).optional(),
  }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid profile payload", "INVALID_PROFILE");

  const displayName = parsed.data.displayName?.trim() ? parsed.data.displayName.trim() : null;
  const bio = parsed.data.bio?.trim() ? parsed.data.bio.trim() : null;
  const avatarCid = parsed.data.avatarCid?.trim() ? parsed.data.avatarCid.trim() : null;

  if (displayName && /[<>]/.test(displayName)) {
    throw new HttpError(400, "Display name contains invalid characters", "INVALID_PROFILE");
  }
  if (bio && /[<>]/.test(bio)) {
    throw new HttpError(400, "Bio contains invalid characters", "INVALID_PROFILE");
  }
  if (avatarCid && !isAvatarValue(avatarCid)) {
    throw new HttpError(400, "Avatar must be an ipfs:// or http(s) URL", "INVALID_PROFILE");
  }

  await ensureUser(db, address, Date.now());
  await updateUserProfile(db, {
    address,
    displayName,
    bio,
    avatarCid,
    updatedAt: Date.now(),
  });

  const user = await getUser(db, address);
  return res.json({ user });
}