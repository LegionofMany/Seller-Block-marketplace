import type { Env } from "../config/env";
import { PinataSDK } from "pinata";

export type PinataPinnedFile = {
  cid: string;
  size?: number;
  mimeType?: string;
};

export type PinataPinnedJson = {
  cid: string;
};

export type PinataAuthStatus = {
  configured: boolean;
  authenticated: boolean;
  message: string;
};

let pinataClient: PinataSDK | null = null;
let pinataClientJwt: string | null = null;

function requirePinataJwt(env: Env): string {
  const jwt = env.pinataJwt?.trim();
  if (!jwt) {
    throw new Error("Pinata is not configured. Set PINATA_JWT to enable IPFS uploads.");
  }
  return jwt;
}

function getPinataClient(env: Env): PinataSDK {
  const jwt = requirePinataJwt(env);
  if (!pinataClient || pinataClientJwt !== jwt) {
    pinataClient = new PinataSDK({ pinataJwt: jwt });
    pinataClientJwt = jwt;
  }
  return pinataClient;
}

export async function pinFileToIpfs(env: Env, file: { buffer: Buffer; filename: string; mimeType?: string }) {
  const blob = new Blob([new Uint8Array(file.buffer)], file.mimeType ? { type: file.mimeType } : undefined);
  const uploadFile = new File([blob], file.filename, file.mimeType ? { type: file.mimeType } : undefined);
  const upload = await getPinataClient(env).upload.public.file(uploadFile);
  const cid = String(upload?.cid ?? "").trim();
  if (!cid) throw new Error("Pinata response missing IpfsHash");

  return {
    cid,
    ...(typeof upload?.size === "number" ? { size: upload.size } : {}),
    ...(typeof upload?.mime_type === "string" && upload.mime_type.trim() ? { mimeType: upload.mime_type } : {}),
  } satisfies PinataPinnedFile;
}

export async function pinJsonToIpfs(env: Env, data: unknown) {
  const upload = await getPinataClient(env).upload.public.json(data as object);
  const cid = String(upload?.cid ?? "").trim();
  if (!cid) throw new Error("Pinata response missing IpfsHash");

  return { cid } satisfies PinataPinnedJson;
}

export async function getPinataAuthStatus(env: Env): Promise<PinataAuthStatus> {
  const jwt = env.pinataJwt?.trim();
  if (!jwt) {
    return {
      configured: false,
      authenticated: false,
      message: "Pinata JWT is not configured",
    };
  }

  try {
    const result = await getPinataClient(env).testAuthentication();
    return {
      configured: true,
      authenticated: true,
      message: typeof result === "string" && result.trim() ? result.trim() : "Pinata authentication succeeded",
    };
  } catch (error) {
    const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Pinata authentication failed";
    return {
      configured: true,
      authenticated: false,
      message,
    };
  }
}

export function ipfsUriFromCid(cid: string): string {
  return `ipfs://${cid}`;
}

export function httpGatewayUrl(env: Env, cid: string): string {
  const base = env.pinataGatewayBaseUrl?.trim() || "https://gateway.pinata.cloud";
  return `${base.replace(/\/$/, "")}/ipfs/${cid}`;
}
