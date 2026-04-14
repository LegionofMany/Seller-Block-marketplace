export function unwrapRpcError(err: any): any {
  return err?.value ?? err?.error ?? err;
}

export function isTransientRpcError(err: any): boolean {
  const inner = unwrapRpcError(err);
  const code = (inner?.code ?? err?.code ?? inner?.errno ?? err?.errno ?? "").toString();
  if (["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(code)) return true;
  if (["TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR"].includes(code)) return true;

  const message = (inner?.shortMessage ?? err?.shortMessage ?? inner?.message ?? err?.message ?? "").toString().toLowerCase();
  if (message.includes("timeout")) return true;
  if (message.includes("econnreset") || message.includes("enotfound") || message.includes("eai_again")) return true;
  return false;
}

export function rpcErrorHint(err: any): string | undefined {
  const inner = unwrapRpcError(err);
  const code = (inner?.code ?? err?.code ?? inner?.errno ?? err?.errno ?? "").toString();
  if (code === "ENOTFOUND") return "RPC hostname could not be resolved (check the configured chain RPC URL, DNS, and internet connectivity).";
  if (code === "ECONNREFUSED") return "RPC host refused the connection (check the configured chain RPC URL and that the endpoint is reachable).";
  if (code === "TIMEOUT") return "RPC request timed out (endpoint may be down or slow; consider using a different RPC URL).";
  if (code === "ECONNRESET") return "RPC connection was reset (often transient).";
  return undefined;
}

export function isRpcUnavailableError(err: any): boolean {
  const inner = unwrapRpcError(err);
  const code = (inner?.code ?? err?.code ?? inner?.errno ?? err?.errno ?? "").toString();
  if (["TIMEOUT", "NETWORK_ERROR", "SERVER_ERROR", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(code)) {
    return true;
  }

  const message = (inner?.shortMessage ?? err?.shortMessage ?? inner?.message ?? err?.message ?? "").toString().toLowerCase();
  return ["timeout", "network error", "missing response", "failed to detect network", "econnreset", "econnrefused", "enotfound", "eai_again"].some((part) => message.includes(part));
}