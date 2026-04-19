import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Seller Block Marketplace",
  description: "A classifieds-first marketplace with wallet-based identity and modern settlement.",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "Seller Block",
    "marketplace classifieds",
    "auction marketplace",
    "raffle marketplace",
    "seller verification",
    "BlockPages",
  ],
  category: "marketplace",
  openGraph: {
    title: "Seller Block Marketplace",
    description: "Marketplace discovery with seller trust layers, wallet-connected settlement, and public listing activity.",
    url: "/",
    siteName: "Seller Block Marketplace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Seller Block Marketplace",
    description: "Marketplace discovery with seller trust layers, wallet-connected settlement, and public listing activity.",
  },
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
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
                    <div>Seller Block Marketplace</div>
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
