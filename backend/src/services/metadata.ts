import { z } from "zod";
import crypto from "node:crypto";

export const metadataSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  image: z.string().url().max(2048).optional(),
  images: z.array(z.string().url().max(2048)).max(12).optional(),
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
