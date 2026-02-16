import { formatEther, type Address } from "viem";

export function shortenHex(value: string, start = 6, end = 4) {
  if (!value) return "";
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function shortAddress(address?: Address) {
  return address ? shortenHex(address) : "";
}

export function formatPrice(price: bigint, isNative: boolean) {
  return isNative ? `${formatEther(price)} ETH` : price.toString();
}

export function formatAmount(amount: bigint, isNative: boolean) {
  return formatPrice(amount, isNative);
}
