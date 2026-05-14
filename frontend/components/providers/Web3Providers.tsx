"use client";

import * as React from "react";
import { WagmiProvider, createConfig, fallback, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { defineChain, type Chain } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet as coinbaseWalletRainbow,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
  trustWallet,
  braveWallet,
} from "@rainbow-me/rainbowkit/wallets";

import { type ApiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { Card, CardContent } from "@/components/ui/card";
import { useWalletAirdrop } from "@/lib/hooks/useWalletAirdrop";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const knownChainsById = new Map<number, Chain>([
  [mainnet.id, mainnet],
  [sepolia.id, sepolia],
  [base.id, base],
  [baseSepolia.id, baseSepolia],
]);

const APP_NAME = "Zonycs";
const APP_URL = "https://www.zonycs.com";

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function isMetaMaskBrowser() {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as Record<string, unknown>).ethereum &&
      ((window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask)
  );
}

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; config: ReturnType<typeof createConfig> }
  >({ status: "loading" });

  const [showMobileGuide, setShowMobileGuide] = React.useState(false);

  function AirdropTrigger() {
    useWalletAirdrop();
    return null;
  }

  React.useEffect(() => {
    // On mobile Chrome without MetaMask browser — show guide
    if (isMobileBrowser() && !isMetaMaskBrowser()) {
      setShowMobileGuide(true);
    }

    try {
      const env = getEnv();
      const chains = env.chains.map((chain) =>
        defineChain({
          ...knownChainsById.get(chain.chainId),
          id: chain.chainId,
          name: chain.name,
          nativeCurrency: {
            name: chain.nativeCurrencyName,
            symbol: chain.nativeCurrencySymbol,
            decimals: 18,
          },
          rpcUrls: {
            default: {
              http: [chain.rpcUrl, ...(chain.rpcFallbackUrl ? [chain.rpcFallbackUrl] : [])],
            },
            public: {
              http: [chain.rpcUrl, ...(chain.rpcFallbackUrl ? [chain.rpcFallbackUrl] : [])],
            },
          },
          ...(knownChainsById.get(chain.chainId)?.contracts
            ? {
                contracts: knownChainsById.get(chain.chainId)?.contracts,
              }
            : {}),
          ...(chain.blockExplorerUrl
            ? {
                blockExplorers: {
                  default: {
                    name: `${chain.name} Explorer`,
                    url: chain.blockExplorerUrl,
                  },
                },
              }
            : {}),
        })
      );

      if (!chains.length) {
        throw new Error("No frontend chains configured");
      }

      const configuredChains = [chains[0], ...chains.slice(1)] as readonly [Chain, ...Chain[]];

      const appUrl = (typeof window !== "undefined" && window.location?.origin) || APP_URL;

      const projectId = env.walletConnectProjectId ?? "";

      // Always build a full connector list regardless of
      // WalletConnect availability. WalletConnect is the primary
      // method for desktop Chrome users without MetaMask extension.
      const connectors = projectId
        ? connectorsForWallets(
            [
              {
                groupName: "Popular",
                wallets: [injectedWallet, metaMaskWallet, coinbaseWalletRainbow, walletConnectWallet],
              },
              {
                groupName: "More",
                wallets: [rainbowWallet, trustWallet, braveWallet],
              },
            ],
            {
              appName: APP_NAME,
              appUrl,
              projectId,
            }
          )
        : [
            // Fallback when no WalletConnect project ID is set:
            // still include injected + coinbase so MetaMask
            // extension on desktop Chrome works
            injected({ shimDisconnect: true, target: "metaMask" }),
            coinbaseWallet({ appName: APP_NAME, appLogoUrl: `${appUrl}/favicon.ico` }),
          ];

      const config = createConfig({
        chains: configuredChains,
        connectors,
        transports: Object.fromEntries(
          env.chains.map((chain) => {
            const primary = chain.rpcUrl;
            const secondary = chain.rpcFallbackUrl;
            return [
              chain.chainId,
              fallback(
                [http(primary, { timeout: 15_000, retryCount: 0 }), ...(secondary ? [http(secondary, { timeout: 15_000, retryCount: 0 })] : [])],
                { rank: false }
              ),
            ];
          })
        ),
        ssr: true,
      });

      setState({ status: "ready", config });
    } catch (e: unknown) {
      setState({
        status: "error",
        message:
          ((e as ApiError | null)?.message ?? "Check NEXT_PUBLIC_* variables.") +
          " (If you just edited .env.local, restart `npm run dev`.)",
      });
    }
  }, []);

  if (state.status === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="p-6 text-sm">
            <div className="font-semibold">Loading wallet providers…</div>
            <div className="mt-2 text-muted-foreground">Initializing wagmi/RainbowKit.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="p-6 text-sm">
            <div className="font-semibold">Missing frontend env vars</div>
            <div className="mt-2 text-muted-foreground break-words">{state.message}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <WagmiProvider config={state.config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()} modalSize="compact">
          <AirdropTrigger />
          {/* Mobile Chrome guide banner */}
          {showMobileGuide ? (
            <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-sm">
              <div className="space-y-0.5">
                <div className="font-semibold text-amber-900">For the best experience on mobile</div>
                <div className="text-xs text-amber-800">
                  Open this site inside the MetaMask app browser, or use WalletConnect to connect your wallet from Chrome.
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <a
                  href="https://metamask.app.link/dapp/zonycs.com"
                  className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                >
                  Open in MetaMask
                </a>
                <button
                  type="button"
                  onClick={() => setShowMobileGuide(false)}
                  className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
