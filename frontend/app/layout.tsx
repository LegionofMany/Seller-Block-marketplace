import type { Metadata } from "next";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { SiteHeader } from "@/components/site/Header";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Seller Block Marketplace",
  description: "A Web3 marketplace powered by MarketplaceRegistry on Sepolia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <Web3Providers>
            <Toaster richColors theme="dark" />
            <div className="min-h-screen">
              <SiteHeader />
              <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
            </div>
          </Web3Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
