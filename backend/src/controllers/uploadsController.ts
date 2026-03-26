import type { Request, Response } from "express";
import { HttpError } from "../middlewares/errors";
import { getContext } from "../services/context";
import { httpGatewayUrl, ipfsUriFromCid, pinFileToIpfs } from "../services/ipfs";

function safeFilename(name: string): string {
  const trimmed = String(name ?? "file").trim();
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length ? base.slice(0, 128) : "file";
}

export async function uploadImages(req: Request, res: Response) {
  const { env } = getContext();

  const files = (req as any).files as Array<Express.Multer.File> | undefined;
  if (!files?.length) {
    throw new HttpError(400, "No files uploaded", "NO_FILES");
  }

  if (files.length > 12) {
    throw new HttpError(400, "Too many files (max 12)", "TOO_MANY_FILES");
  }

  const items = [] as Array<{ cid: string; ipfsUri: string; url: string; filename: string; size: number }>; 

  for (const f of files) {
    if (!f?.buffer?.length) continue;
    const mime = String(f.mimetype ?? "");
    if (!mime.startsWith("image/")) {
      throw new HttpError(400, `Unsupported file type: ${mime || "unknown"}`, "UNSUPPORTED_FILE_TYPE");
    }

    const pinned = await pinFileToIpfs(env, {
      buffer: f.buffer,
      filename: safeFilename(f.originalname || "image"),
      mimeType: mime,
    });

    items.push({
      cid: pinned.cid,
      ipfsUri: ipfsUriFromCid(pinned.cid),
      url: httpGatewayUrl(env, pinned.cid),
      filename: safeFilename(f.originalname || "image"),
      size: Number(pinned.size ?? f.size ?? 0),
    });
  }

  return res.status(201).json({ items });
}
