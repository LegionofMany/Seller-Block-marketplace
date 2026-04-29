"use client";

import * as React from "react";
import { WagmiProvider, createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain, type Chain } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";

import { type ApiError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getWalletConnectAvailability } from "@/lib/walletConnect";
import { Card, CardContent } from "@/components/ui/card";

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

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; config: ReturnType<typeof createConfig> }
  >({ status: "loading" });

  React.useEffect(() => {
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
            default: { http: [chain.rpcUrl, ...(chain.rpcFallbackUrl ? [chain.rpcFallbackUrl] : [])] },
            public: { http: [chain.rpcUrl, ...(chain.rpcFallbackUrl ? [chain.rpcFallbackUrl] : [])] },
          },
          ...(knownChainsById.get(chain.chainId)?.contracts
            ? {
                contracts: knownChainsById.get(chain.chainId)?.contracts,
              }
            : {}),
          ...(chain.blockExplorerUrl
            ? {
                blockExplorers: {
                  default: { name: `${chain.name} Explorer`, url: chain.blockExplorerUrl },
                },
              }
            : {}),
        })
      );
      if (!chains.length) throw new Error("No frontend chains configured");
      const configuredChains = [chains[0], ...chains.slice(1)] as readonly [Chain, ...Chain[]];
      const walletConnectAvailability = getWalletConnectAvailability(env.walletConnectProjectId);
      const appUrl = (typeof window !== "undefined" && window.location?.origin) || APP_URL;
      const connectors = env.walletConnectProjectId
        ? connectorsForWallets(
            [
              {
                groupName: "Wallets",
                wallets: [
                  injectedWallet,
                  metaMaskWallet,
                  coinbaseWallet,
                  ...(walletConnectAvailability === "enabled" ? [walletConnectWallet] : []),
                ],
              },
            ],
            {
              appName: APP_NAME,
              appUrl,
              projectId: env.walletConnectProjectId,
            }
          )
        : [injected()];
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
                [
                  http(primary, { timeout: 15_000, retryCount: 0 }),
                  ...(secondary ? [http(secondary, { timeout: 15_000, retryCount: 0 })] : []),
                ],
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
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
