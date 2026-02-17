import { z } from "zod";
import crypto from "node:crypto";

export const metadataSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  image: z.string().url().max(2048),
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
  const json = JSON.stringify(input);
  const id = crypto.createHash("sha256").update(json).digest("hex");
  // A stable placeholder URI format we can later swap for IPFS pinning.
  return { metadataURI: `metadata://sha256/${id}`, id };
}
