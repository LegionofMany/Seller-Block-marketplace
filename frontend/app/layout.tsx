import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { SiteHeader } from "@/components/site/Header";
import { Toaster } from "sonner";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
const githubRepoUrl = "https://github.com/LegionofMany/Seller-Block-marketplace";
const githubWikiUrl = `${githubRepoUrl}/wiki`;
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1e2433" },
  ],
};

const BASE_URL = "https://www.zonycs.com";
const SITE_NAME = "Zonycs";
const DEFAULT_TITLE = "Zonycs — Buy & Sell Locally";
const DEFAULT_DESCRIPTION =
  "Zonycs is a free classifieds marketplace for buying " +
  "and selling locally. Post ads for cars, real estate, " +
  "jobs, antiques and more — with optional blockchain " +
  "escrow for secure transactions.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s — Zonycs",
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "classifieds",
    "buy and sell",
    "local marketplace",
    "free ads",
    "cars for sale",
    "real estate",
    "jobs",
    "blockchain escrow",
    "Canada classifieds",
    "Edmonton",
    "Calgary",
    "Alberta",
    "Ontario",
    "zonycs",
  ],
  authors: [{ name: "Zonycs", url: BASE_URL }],
  creator: "Zonycs",
  publisher: "Zonycs",
  category: "marketplace",
  classification: "Classifieds / Marketplace",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: BASE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Zonycs — Buy & Sell Locally",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [`${BASE_URL}/og-image.png`],
    creator: "@zonycs",
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="market-shell min-h-screen overflow-x-hidden bg-background text-foreground">
        <ThemeProvider>
          <Web3Providers>
            <AuthProvider>
              <Toaster richColors theme="dark" />
              <div className="min-h-screen">
                <SiteHeader />
                <main className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:py-8">{children}</main>
                <footer className="border-t border-border/70 bg-background/70 backdrop-blur">
                  <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <div>Zonycs</div>
                    <div>Classifieds-first discovery, public threads, wallet-connected settlement.</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={githubRepoUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                        GitHub
                      </a>
                      <a href={githubWikiUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                        Wiki
                      </a>
                    </div>
                  </div>
                </footer>
              </div>
            </AuthProvider>
          </Web3Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
