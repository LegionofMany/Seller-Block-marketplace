import type { Request, Response } from "express";
import { z } from "zod";

import { HttpError } from "../middlewares/errors";
import { requireAdmin, requireAuthAddress } from "../middlewares/auth";
import { getContext } from "../services/context";
import { createUserFollow, createUserTrustReview, deleteUserFollow, ensureUser, getPublicUserProfile, getUser, isUserFollowing, listFollowedUsers, listTrustQueueProfiles, listUserTrustReviews, listVerifiedUserProfiles, updateUserProfile, updateUserTrust, updateUserStablecoin } from "../services/db";
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
      followerCount: profile.followerCount,
      responseRate: profile.responseRate,
      reputation: profile.reputation,
    },
  });
}

export async function getFollowState(req: Request, res: Response) {
  const { db } = getContext();
  const follower = requireAuthAddress(req);
  const followed = requireAddress(String(req.params.address ?? ""), "address");

  if (follower.toLowerCase() === followed.toLowerCase()) {
    return res.json({ isFollowing: false });
  }

  const isFollowing = await isUserFollowing(db, follower, followed);
  return res.json({ isFollowing });
}

export async function getMyFollowedUsers(req: Request, res: Response) {
  const { db } = getContext();
  const follower = requireAuthAddress(req);
  const items = await listFollowedUsers(db, follower, 100);
  return res.json({ items });
}

export async function followUser(req: Request, res: Response) {
  const { db } = getContext();
  const follower = requireAuthAddress(req);
  const followed = requireAddress(String(req.params.address ?? ""), "address");

  if (follower.toLowerCase() === followed.toLowerCase()) {
    throw new HttpError(400, "You cannot follow yourself", "INVALID_FOLLOW");
  }

  const now = Date.now();
  await ensureUser(db, follower, now);
  await ensureUser(db, followed, now);
  await createUserFollow(db, { follower, followed, createdAt: now });

  return res.status(201).json({ ok: true });
}

export async function unfollowUser(req: Request, res: Response) {
  const { db } = getContext();
  const follower = requireAuthAddress(req);
  const followed = requireAddress(String(req.params.address ?? ""), "address");

  await deleteUserFollow(db, follower, followed);
  return res.json({ ok: true });
}

export async function updateMyProfile(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const parsed = z.object({
    fullName: z.string().max(120).optional(),
    displayName: z.string().max(80).optional(),
    bio: z.string().max(1000).optional(),
    avatarCid: z.string().max(2048).optional(),
    phoneNumber: z.string().max(32).optional(),
    streetAddress1: z.string().max(160).optional(),
    streetAddress2: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    region: z.string().max(80).optional(),
    postalCode: z.string().max(32).optional(),
  }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid profile payload", "INVALID_PROFILE");

  const fullName = parsed.data.fullName?.trim() ? parsed.data.fullName.trim() : null;
  const displayName = parsed.data.displayName?.trim() ? parsed.data.displayName.trim() : null;
  const bio = parsed.data.bio?.trim() ? parsed.data.bio.trim() : null;
  const avatarCid = parsed.data.avatarCid?.trim() ? parsed.data.avatarCid.trim() : null;
  const phoneNumber = parsed.data.phoneNumber?.trim() ? parsed.data.phoneNumber.trim() : null;
  const streetAddress1 = parsed.data.streetAddress1?.trim() ? parsed.data.streetAddress1.trim() : null;
  const streetAddress2 = parsed.data.streetAddress2?.trim() ? parsed.data.streetAddress2.trim() : null;
  const city = parsed.data.city?.trim() ? parsed.data.city.trim() : null;
  const region = parsed.data.region?.trim() ? parsed.data.region.trim() : null;
  const postalCode = parsed.data.postalCode?.trim() ? parsed.data.postalCode.trim() : null;

  if (fullName && /[<>]/.test(fullName)) {
    throw new HttpError(400, "Full name contains invalid characters", "INVALID_PROFILE");
  }
  if (displayName && /[<>]/.test(displayName)) {
    throw new HttpError(400, "Display name contains invalid characters", "INVALID_PROFILE");
  }
  if (bio && /[<>]/.test(bio)) {
    throw new HttpError(400, "Bio contains invalid characters", "INVALID_PROFILE");
  }
  if (avatarCid && !isAvatarValue(avatarCid)) {
    throw new HttpError(400, "Avatar must be an ipfs:// or http(s) URL", "INVALID_PROFILE");
  }
  if (phoneNumber && !/^[0-9+()\-\s]{7,32}$/.test(phoneNumber)) {
    throw new HttpError(400, "Phone number format is invalid", "INVALID_PROFILE");
  }

  await ensureUser(db, address, Date.now());
  const profileUpdatePayload: any = {
    address,
    fullName,
    displayName,
    bio,
    avatarCid,
    phoneNumber,
    streetAddress1,
    streetAddress2,
    city,
    region,
    postalCode,
    updatedAt: Date.now(),
  };

  await updateUserProfile(db, profileUpdatePayload);

  const user = await getUser(db, address);
  return res.json({ user });
}

export async function updateMyStablecoin(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const parsed = z.object({ stablecoinAddress: z.string().max(80).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Invalid payload", "INVALID_PAYLOAD");

  let stablecoinAddress: string | null = null;
  if (parsed.data.stablecoinAddress?.trim()) {
    try {
      stablecoinAddress = requireAddress(parsed.data.stablecoinAddress.trim(), "stablecoinAddress");
    } catch (err) {
      throw new HttpError(400, "Invalid stablecoin address", "INVALID_PROFILE");
    }
  }

  await ensureUser(db, address, Date.now());
  await updateUserStablecoin(db, address, stablecoinAddress, Date.now());
  const user = await getUser(db, address);
  return res.json({ user });
}

export async function updateUserTrustAction(req: Request, res: Response) {
  const { db } = getContext();
  const adminSubject = requireAdmin(req);
  const address = requireAddress(String(req.params.address ?? ""), "address");
  const parsed = z.object({
    sellerVerified: z.boolean(),
    sellerTrustNote: z.string().max(500).optional(),
  }).safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Invalid trust payload", "INVALID_TRUST_PAYLOAD");

  const now = Date.now();
  await ensureUser(db, address, now);
  const previousUser = await getUser(db, address);
  await updateUserTrust(db, {
    address,
    sellerVerifiedAt: parsed.data.sellerVerified ? now : null,
    sellerVerifiedBy: parsed.data.sellerVerified ? adminSubject : null,
    sellerTrustNote: parsed.data.sellerTrustNote?.trim() ? parsed.data.sellerTrustNote.trim() : null,
    updatedAt: now,
  });
  await createUserTrustReview(db, {
    userAddress: address,
    reviewer: adminSubject,
    sellerVerified: parsed.data.sellerVerified,
    sellerTrustNote: parsed.data.sellerTrustNote?.trim() ? parsed.data.sellerTrustNote.trim() : null,
    previousSellerVerified: typeof previousUser?.sellerVerifiedAt === "number" ? true : false,
    previousSellerTrustNote: previousUser?.sellerTrustNote ?? null,
    createdAt: now,
  });

  const user = await getUser(db, address);
  return res.json({ user });
}

export async function getAdminTrustSummary(req: Request, res: Response) {
  requireAdmin(req);
  const { db } = getContext();
  const [queue, verified, history] = await Promise.all([
    listTrustQueueProfiles(db, 12),
    listVerifiedUserProfiles(db, 12),
    listUserTrustReviews(db, 40),
  ]);

  return res.json({ queue, verified, history });
}