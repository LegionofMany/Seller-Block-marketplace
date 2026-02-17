import type { Request, Response } from "express";
import { metadataSchema, buildFakeMetadataUri } from "../services/metadata";
import { HttpError } from "../middlewares/errors";

export async function uploadMetadata(req: Request, res: Response) {
  const parsed = metadataSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid metadata payload", "INVALID_METADATA");
  }

  const { metadataURI, id } = buildFakeMetadataUri(parsed.data);

  return res.status(201).json({ metadataURI, id });
}
