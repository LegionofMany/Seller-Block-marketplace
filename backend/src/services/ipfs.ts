import type { Env } from "../config/env";

const PINATA_BASE_URL = "https://api.pinata.cloud";

export type PinataPinnedFile = {
  cid: string;
  size?: number;
  mimeType?: string;
};

export type PinataPinnedJson = {
  cid: string;
};

function requirePinataJwt(env: Env): string {
  const jwt = env.pinataJwt?.trim();
  if (!jwt) {
    throw new Error("Pinata is not configured. Set PINATA_JWT to enable IPFS uploads.");
  }
  return jwt;
}

async function pinataFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  const jwt = requirePinataJwt(env);
  const res = await fetch(`${PINATA_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinata error ${res.status}: ${text || res.statusText}`);
  }

  return res;
}

export async function pinFileToIpfs(env: Env, file: { buffer: Buffer; filename: string; mimeType?: string }) {
  const form = new FormData();

  const blob = new Blob([new Uint8Array(file.buffer)], file.mimeType ? { type: file.mimeType } : undefined);
  form.append("file", blob, file.filename);

  const res = await pinataFetch(env, "/pinning/pinFileToIPFS", {
    method: "POST",
    body: form,
  });

  const json: any = await res.json();
  const cid = String(json?.IpfsHash ?? "").trim();
  if (!cid) throw new Error("Pinata response missing IpfsHash");

  return { cid, size: Number(json?.PinSize ?? 0) } satisfies PinataPinnedFile;
}

export async function pinJsonToIpfs(env: Env, data: unknown) {
  const res = await pinataFetch(env, "/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const json: any = await res.json();
  const cid = String(json?.IpfsHash ?? "").trim();
  if (!cid) throw new Error("Pinata response missing IpfsHash");

  return { cid } satisfies PinataPinnedJson;
}

export function ipfsUriFromCid(cid: string): string {
  return `ipfs://${cid}`;
}

export function httpGatewayUrl(env: Env, cid: string): string {
  const base = env.pinataGatewayBaseUrl?.trim() || "https://gateway.pinata.cloud";
  return `${base.replace(/\/$/, "")}/ipfs/${cid}`;
}
