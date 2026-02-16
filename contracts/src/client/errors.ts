import { Interface } from "ethers";

export type DecodedRevert =
  | {
      kind: "CustomError";
      name: string;
      signature: string;
      args: unknown[];
    }
  | {
      kind: "RevertString";
      reason: string;
    }
  | {
      kind: "Panic";
      code: bigint;
    }
  | {
      kind: "Unknown";
      data?: string;
      message?: string;
    };

function extractRevertData(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as any;

  const candidates: unknown[] = [
    anyErr.data,
    anyErr.error?.data,
    anyErr.error?.error?.data,
    anyErr.info?.error?.data,
    anyErr.info?.error?.error?.data,
    anyErr.receipt?.revertReason,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("0x") && c.length >= 10) return c;
  }

  return undefined;
}

function extractMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as any;
  return (
    (typeof anyErr.shortMessage === "string" && anyErr.shortMessage) ||
    (typeof anyErr.reason === "string" && anyErr.reason) ||
    (typeof anyErr.message === "string" && anyErr.message) ||
    undefined
  );
}

export function decodeRevert(err: unknown, ifaces: Interface[] = []): DecodedRevert {
  const data = extractRevertData(err);
  const message = extractMessage(err);

  if (data) {
    // Error(string): 0x08c379a0
    if (data.startsWith("0x08c379a0")) {
      try {
        const i = new Interface(["function Error(string)"]);
        const decoded = i.decodeFunctionData("Error", data) as unknown as [string];
        return { kind: "RevertString", reason: decoded[0] };
      } catch {
        return { kind: "Unknown", data, message };
      }
    }

    // Panic(uint256): 0x4e487b71
    if (data.startsWith("0x4e487b71")) {
      try {
        const i = new Interface(["function Panic(uint256)"]);
        const decoded = i.decodeFunctionData("Panic", data) as unknown as [bigint];
        return { kind: "Panic", code: decoded[0] };
      } catch {
        return { kind: "Unknown", data, message };
      }
    }

    for (const iface of ifaces) {
      try {
        const parsed = iface.parseError(data);
        if (!parsed) continue;
        return {
          kind: "CustomError",
          name: parsed.name,
          signature: parsed.signature,
          args: Array.from(parsed.args ?? []),
        };
      } catch {
        // try next
      }
    }

    return { kind: "Unknown", data, message };
  }

  return { kind: "Unknown", message };
}

export function formatDecodedRevert(decoded: DecodedRevert): string {
  switch (decoded.kind) {
    case "CustomError":
      return `${decoded.name}(${decoded.signature}) args=${JSON.stringify(decoded.args)}`;
    case "RevertString":
      return decoded.reason;
    case "Panic":
      return `Panic(0x${decoded.code.toString(16)})`;
    default:
      return decoded.message ?? "Unknown revert";
  }
}
