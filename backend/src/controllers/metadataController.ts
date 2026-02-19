import type { Request, Response } from "express";
import { metadataSchema, buildFakeMetadataUri } from "../services/metadata";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { findMetadata, upsertMetadata } from "../services/db";

export async function uploadMetadata(req: Request, res: Response) {
  const { db } = getContext();

  const parsed = metadataSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid metadata payload", "INVALID_METADATA");
  }

  const { metadataURI, id } = buildFakeMetadataUri(parsed.data);

  upsertMetadata(db, {
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    image: parsed.data.image,
    attributesJson: JSON.stringify(parsed.data.attributes ?? []),
    createdAt: Date.now(),
  });

  return res.status(201).json({ metadataURI, id });
}

export async function getMetadataById(req: Request, res: Response) {
  const { db } = getContext();

  const id = String(req.params.id ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) {
    throw new HttpError(400, "Invalid metadata id", "INVALID_METADATA_ID");
  }

  const row = findMetadata(db, id);
  if (!row) {
    throw new HttpError(404, "Metadata not found", "METADATA_NOT_FOUND");
  }

  let attributes: unknown = [];
  try {
    attributes = JSON.parse(row.attributesJson);
  } catch {
    attributes = [];
  }

  return res.json({
    id: row.id,
    title: row.title,
    description: row.description,
    image: row.image,
    attributes,
    createdAt: row.createdAt,
  });
}
