import type { NextFunction, Request, Response } from "express";
import { isRpcUnavailableError, rpcErrorHint } from "../utils/rpc";

export type ApiErrorBody = {
  error: {
    message: string;
    code?: string | undefined;
  };
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { message: "Not found" } } satisfies ApiErrorBody);
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (isRpcUnavailableError(err)) {
    req.log?.warn?.({ err, hint: rpcErrorHint(err) }, "rpc dependency unavailable");
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      error: {
        message: "Blockchain dependency temporarily unavailable. Please retry shortly.",
        code: "RPC_UNAVAILABLE",
      },
    } satisfies ApiErrorBody);
    return;
  }

  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message ? String(err.message) : "Internal server error";
  const code = err?.code ? String(err.code) : undefined;

  if (status >= 500) {
    req.log?.error?.({ err }, "request failed");
    // Avoid leaking internals; keep message generic unless explicitly provided.
    res.status(status).json({ error: { message: "Internal server error" } } satisfies ApiErrorBody);
    return;
  }

  const body = code
    ? ({ error: { message, code } } satisfies ApiErrorBody)
    : ({ error: { message } } satisfies ApiErrorBody);
  res.status(status).json(body);
}
