import pino from "pino";

export function createLogger() {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    return pino({ level: process.env.LOG_LEVEL ?? "info" });
  }

  return pino({
    level: process.env.LOG_LEVEL ?? "debug",
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  });
}
