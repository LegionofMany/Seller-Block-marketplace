import type { Metadata } from "next";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { SiteHeader } from "@/components/site/Header";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Seller Block Marketplace",
  description: "A classifieds-first marketplace with wallet-based identity and modern settlement.",
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
                    <div>Classifieds-first discovery, public threads, wallet-based checkout.</div>
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
