"use client";

import * as React from "react";
import { WagmiProvider, createConfig, fallback, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain, type Chain } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";

import { getEnv } from "@/lib/env";
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
      const connectors = [
        injected(),
        ...(env.walletConnectProjectId
          ? [walletConnect({ projectId: env.walletConnectProjectId, showQrModal: true })]
          : []),
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
    } catch (e: any) {
      setState({
        status: "error",
        message:
          (e?.message ?? "Check NEXT_PUBLIC_* variables.") +
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
