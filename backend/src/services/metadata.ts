import { z } from "zod";
import crypto from "node:crypto";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isIpfsUri(value: string): boolean {
  return /^ipfs:\/\/[a-zA-Z0-9]+(\/.*)?$/.test(value);
}

const imageUriSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((v) => isHttpUrl(v) || isIpfsUri(v), { message: "Expected http(s) URL or ipfs:// URI" });

const safeTextSchema = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: "HTML-like content is not allowed" });

export const metadataSchema = z.object({
  title: safeTextSchema(120),
  description: safeTextSchema(2000),
  image: imageUriSchema.optional(),
  images: z.array(imageUriSchema).max(12).optional(),
  category: z.string().min(1).max(64).optional(),
  subcategory: z.string().min(1).max(64).optional(),
  city: z.string().min(1).max(64).optional(),
  region: z.string().min(1).max(64).optional(),
  postalCode: z.string().min(1).max(16).optional(),
  contactEmail: z.string().email().max(120).optional(),
  contactPhone: z.string().min(7).max(32).optional(),
  attributes: z
    .array(
      z.object({
        trait_type: z.string().min(1).max(64),
        value: z.union([z.string().max(256), z.number(), z.boolean()]),
      })
    )
    .default([]),
});

export type MetadataInput = z.infer<typeof metadataSchema>;

export function buildFakeMetadataUri(input: MetadataInput): { metadataURI: string; id: string } {
  const normalized = {
    ...input,
    images: Array.isArray(input.images) ? input.images : input.image ? [input.image] : [],
  };
  // Ensure legacy `image` is always populated (primary image) when possible.
  (normalized as any).image = (normalized as any).image ?? ((normalized as any).images?.[0] ?? "");

  const json = JSON.stringify(normalized);
  const id = crypto.createHash("sha256").update(json).digest("hex");
  // A stable placeholder URI format we can later swap for IPFS pinning.
  return { metadataURI: `metadata://sha256/${id}`, id };
}
