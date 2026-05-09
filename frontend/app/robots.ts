import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/marketplace",
          "/listing/",
          "/seller/",
          "/create",
          "/sign-in",
        ],
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/api/",
          "/account-created",
          "/_next/",
        ],
      },
      {
        // Block AI training bots
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "CCBot",
          "anthropic-ai",
          "Claude-Web",
          "Google-Extended",
          "Omgilibot",
          "Diffbot",
        ],
        disallow: ["/"],
      },
    ],
    sitemap: "https://www.zonycs.com/sitemap.xml",
    host: "https://www.zonycs.com",
  };
}
