"use client";

import * as React from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";

import { getEnv } from "@/lib/env";
import { Card, CardContent } from "@/components/ui/card";

const queryClient = new QueryClient();

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
          [sepolia.id]: http(env.sepoliaRpcUrl),
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
        <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
