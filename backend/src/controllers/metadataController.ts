import type { Request, Response } from "express";
import { metadataSchema, buildFakeMetadataUri } from "../services/metadata";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { findMetadata, findMetadataByUri, upsertMetadata } from "../services/db";
import { ipfsUriFromCid, pinJsonToIpfs } from "../services/ipfs";

export async function uploadMetadata(req: Request, res: Response) {
  const { db } = getContext();

  const parsed = metadataSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid metadata payload", "INVALID_METADATA");
  }

  const { metadataURI, id } = buildFakeMetadataUri(parsed.data);

  const images = Array.isArray((parsed.data as any).images)
    ? ((parsed.data as any).images as string[])
    : parsed.data.image
      ? [parsed.data.image]
      : [];
  const primaryImage = (parsed.data.image ?? images[0] ?? "").trim();
  if (!primaryImage) {
    throw new HttpError(400, "Metadata must include at least one image", "INVALID_METADATA_IMAGE");
  }

  await upsertMetadata(db, {
    id,
    uri: metadataURI,
    title: parsed.data.title,
    description: parsed.data.description,
    image: primaryImage,
    imagesJson: JSON.stringify(images),
    category: (parsed.data as any).category ?? null,
    subcategory: (parsed.data as any).subcategory ?? null,
    city: (parsed.data as any).city ?? null,
    region: (parsed.data as any).region ?? null,
    postalCode: (parsed.data as any).postalCode ?? null,
    contactEmail: (parsed.data as any).contactEmail ?? null,
    contactPhone: (parsed.data as any).contactPhone ?? null,
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

  const row = await findMetadata(db, id);
  if (!row) {
    throw new HttpError(404, "Metadata not found", "METADATA_NOT_FOUND");
  }

  let attributes: unknown = [];
  try {
    attributes = JSON.parse(row.attributesJson);
  } catch {
    attributes = [];
  }

  let images: unknown = [];
  try {
    images = row.imagesJson ? JSON.parse(row.imagesJson) : [];
  } catch {
    images = [];
  }

  return res.json({
    id: row.id,
    title: row.title,
    description: row.description,
    image: row.image,
    images,
    category: row.category ?? undefined,
    subcategory: row.subcategory ?? undefined,
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    postalCode: row.postalCode ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    contactPhone: row.contactPhone ?? undefined,
    attributes,
    createdAt: row.createdAt,
  });
}

export async function getMetadataByUriHandler(req: Request, res: Response) {
  const { db } = getContext();

  const uri = String(req.query.uri ?? "").trim();
  if (!uri || uri.length > 2048) {
    throw new HttpError(400, "Invalid metadata uri", "INVALID_METADATA_URI");
  }

  const row = await findMetadataByUri(db, uri);
  if (!row) {
    throw new HttpError(404, "Metadata not found", "METADATA_NOT_FOUND");
  }

  let attributes: unknown = [];
  try {
    attributes = JSON.parse(row.attributesJson);
  } catch {
    attributes = [];
  }

  let images: unknown = [];
  try {
    images = row.imagesJson ? JSON.parse(row.imagesJson) : [];
  } catch {
    images = [];
  }

  return res.json({
    id: row.id,
    uri: row.uri ?? uri,
    title: row.title,
    description: row.description,
    image: row.image,
    images,
    category: row.category ?? undefined,
    subcategory: row.subcategory ?? undefined,
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    postalCode: row.postalCode ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    contactPhone: row.contactPhone ?? undefined,
    attributes,
    createdAt: row.createdAt,
  });
}

export async function uploadMetadataIpfs(req: Request, res: Response) {
  const { env, db } = getContext();

  const parsed = metadataSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid metadata payload", "INVALID_METADATA");
  }

  const images = Array.isArray((parsed.data as any).images)
    ? ((parsed.data as any).images as string[])
    : parsed.data.image
      ? [parsed.data.image]
      : [];
  const primaryImage = (parsed.data.image ?? images[0] ?? "").trim();
  if (!primaryImage) {
    throw new HttpError(400, "Metadata must include at least one image", "INVALID_METADATA_IMAGE");
  }

  // Compute a stable id using the existing sha256 scheme.
  const { id } = buildFakeMetadataUri(parsed.data);

  const metadataJson = {
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    image: primaryImage,
    images,
    category: (parsed.data as any).category,
    subcategory: (parsed.data as any).subcategory,
    city: (parsed.data as any).city,
    region: (parsed.data as any).region,
    postalCode: (parsed.data as any).postalCode,
    contactEmail: (parsed.data as any).contactEmail,
    contactPhone: (parsed.data as any).contactPhone,
    attributes: parsed.data.attributes ?? [],
    createdAt: Date.now(),
  };

  const pinned = await pinJsonToIpfs(env, metadataJson);
  const metadataURI = ipfsUriFromCid(pinned.cid);

  await upsertMetadata(db, {
    id,
    uri: metadataURI,
    title: parsed.data.title,
    description: parsed.data.description,
    image: primaryImage,
    imagesJson: JSON.stringify(images),
    category: (parsed.data as any).category ?? null,
    subcategory: (parsed.data as any).subcategory ?? null,
    city: (parsed.data as any).city ?? null,
    region: (parsed.data as any).region ?? null,
    postalCode: (parsed.data as any).postalCode ?? null,
    contactEmail: (parsed.data as any).contactEmail ?? null,
    contactPhone: (parsed.data as any).contactPhone ?? null,
    attributesJson: JSON.stringify(parsed.data.attributes ?? []),
    createdAt: Date.now(),
  });

  return res.status(201).json({ metadataURI, cid: pinned.cid, id });
}
