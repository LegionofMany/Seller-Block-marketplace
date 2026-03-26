import { getEnv } from "@/lib/env";

export function isIpfsUri(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("ipfs://");
}

export function ipfsToHttp(uri: string): string {
  const clean = String(uri ?? "").trim();
  if (!isIpfsUri(clean)) return clean;

  const cid = clean.slice("ipfs://".length).replace(/^ipfs\//i, "").replace(/^\/+/, "");
  const env = getEnv();
  const base = (env.ipfsGatewayBaseUrl ?? "https://gateway.pinata.cloud").replace(/\/$/, "");
  return `${base}/ipfs/${cid}`;
}
