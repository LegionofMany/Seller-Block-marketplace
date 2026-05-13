/**
 * lib/logger.ts — structured, production-safe console logger.
 *
 * Each call emits a JSON-style prefix so Render logs are grep-able:
 *   [2026-05-13T14:32:01.123Z] ERROR [ListingPage] Metadata fetch failed — {"status":500}
 *
 * In development, output is colourised for readability.
 * No external service required — drop in Sentry/Datadog later by replacing
 * the `_emit` function body.
 */

type Level = "debug" | "info" | "warn" | "error";

const IS_DEV = process.env.NODE_ENV === "development";

const COLOURS: Record<Level, string> = {
  debug: "\x1b[36m", // cyan
  info:  "\x1b[32m", // green
  warn:  "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function _emit(level: Level, context: string, message: string, meta?: unknown) {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` — ${JSON.stringify(meta)}` : "";
  const line = `[${ts}] ${level.toUpperCase()} [${context}] ${message}${metaStr}`;

  if (IS_DEV) {
    const colour = COLOURS[level] ?? "";
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](`${colour}${line}${RESET}`);
  } else {
    // In production, plain text so Render can ingest / grep cleanly
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](line);
  }
}

/** Create a namespaced logger bound to a component or module name. */
export function createLogger(context: string) {
  return {
    debug: (msg: string, meta?: unknown) => _emit("debug", context, msg, meta),
    info:  (msg: string, meta?: unknown) => _emit("info",  context, msg, meta),
    warn:  (msg: string, meta?: unknown) => _emit("warn",  context, msg, meta),
    error: (msg: string, meta?: unknown) => _emit("error", context, msg, meta),
  };
}

/** Convenience singleton for ad-hoc use. */
export const logger = createLogger("App");
