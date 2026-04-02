import type { Request, Response } from "express";
import { z } from "zod";

import { requireAuthAddress } from "../middlewares/auth";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { createSavedSearch, deleteSavedSearch, ensureUser, findSavedSearchById, listSavedSearchesByUser, updateSavedSearch, type SavedSearchFilters } from "../services/db";

const filtersSchema = z.object({
  q: z.string().max(120).optional(),
  category: z.string().max(80).optional(),
  subcategory: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  postalCode: z.string().max(32).optional(),
  minPrice: z.string().max(80).optional(),
  maxPrice: z.string().max(80).optional(),
  type: z.enum(["fixed", "auction", "raffle"]).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).optional(),
});

const payloadSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(320).optional().or(z.literal("")),
  filters: filtersSchema,
});

function cleanFilters(filters: SavedSearchFilters): SavedSearchFilters {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) entries.push([key, trimmed]);
  }
  return Object.fromEntries(entries) as SavedSearchFilters;
}

export async function listSavedSearches(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const items = await listSavedSearchesByUser(db, address);
  return res.json({ items });
}

export async function createSavedSearchAction(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid saved search payload", "INVALID_SAVED_SEARCH");

  const name = parsed.data.name.trim();
  const email = parsed.data.email?.trim() ? parsed.data.email.trim() : null;
  const filters = cleanFilters(parsed.data.filters as SavedSearchFilters);
  if (Object.keys(filters).length === 0) {
    throw new HttpError(400, "Saved search must include at least one filter", "INVALID_SAVED_SEARCH");
  }

  const now = Date.now();
  await ensureUser(db, address, now);
  const item = await createSavedSearch(db, {
    userAddress: address,
    name,
    email,
    filters,
    createdAt: now,
    updatedAt: now,
  });
  return res.status(201).json({ item });
}

export async function updateSavedSearchAction(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, "Invalid saved search id", "INVALID_SAVED_SEARCH");

  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid saved search payload", "INVALID_SAVED_SEARCH");

  const existing = await findSavedSearchById(db, id);
  if (!existing || existing.userAddress.toLowerCase() !== address.toLowerCase()) {
    throw new HttpError(404, "Saved search not found", "SAVED_SEARCH_NOT_FOUND");
  }

  const item = await updateSavedSearch(db, {
    id,
    userAddress: address,
    name: parsed.data.name.trim(),
    email: parsed.data.email?.trim() ? parsed.data.email.trim() : null,
    filters: cleanFilters(parsed.data.filters as SavedSearchFilters),
    updatedAt: Date.now(),
  });

  return res.json({ item });
}

export async function deleteSavedSearchAction(req: Request, res: Response) {
  const { db } = getContext();
  const address = requireAuthAddress(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, "Invalid saved search id", "INVALID_SAVED_SEARCH");
  await deleteSavedSearch(db, id, address);
  return res.json({ ok: true });
}