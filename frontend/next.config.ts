import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "pino-pretty": path.resolve(__dirname, "shims/pino-pretty.js"),
      "@react-native-async-storage/async-storage": path.resolve(__dirname, "shims/async-storage.js"),
    };

    return config;
  },
};

export default nextConfig;
