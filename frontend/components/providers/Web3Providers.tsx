"use client";

import * as React from "react";
import { WagmiProvider, createConfig, fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
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

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; config: ReturnType<typeof createConfig> }
  >({ status: "loading" });

  React.useEffect(() => {
    try {
      const env = getEnv();
      const connectors = [
        injected(),
        ...(env.walletConnectProjectId
          ? [walletConnect({ projectId: env.walletConnectProjectId, showQrModal: true })]
          : []),
      ];
      const config = createConfig({
        chains: [sepolia],
        connectors,
        transports: {
          [sepolia.id]: (() => {
            // If a fallback URL is provided, treat it as the preferred RPC.
            // This helps when the default RPC (often Infura) is rate-limited.
            const primary = env.sepoliaRpcFallbackUrl ?? env.sepoliaRpcUrl;
            const secondary = env.sepoliaRpcFallbackUrl ? env.sepoliaRpcUrl : "https://rpc.sepolia.org";

            return fallback(
              [
                http(primary, { timeout: 15_000, retryCount: 0 }),
                http(secondary, { timeout: 15_000, retryCount: 0 }),
              ],
              { rank: false }
            );
          })(),
        },
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
