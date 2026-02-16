import { getAddress, isAddress } from "ethers";

export function assertAddress(value: string, label = "address"): string {
  if (!isAddress(value)) throw new Error(`Invalid ${label}: ${value}`);
  return getAddress(value);
}

export function assertBytes32(value: string, label = "bytes32"): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

export function assertUint(value: bigint, label = "uint"): bigint {
  if (value < 0n) throw new Error(`Invalid ${label}: must be >= 0`);
  return value;
}

export function assertUintInRange(value: bigint, min: bigint, max: bigint, label = "uint"): bigint {
  assertUint(value, label);
  if (value < min || value > max) throw new Error(`Invalid ${label}: expected [${min}, ${max}], got ${value}`);
  return value;
}

export function assertBps(value: number, label = "bps"): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

export function assertTimestamp(value: number, label = "timestamp"): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

export type SaleType = 0 | 1 | 2;

export function assertSaleType(value: number, label = "saleType"): SaleType {
  if (value !== 0 && value !== 1 && value !== 2) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}
