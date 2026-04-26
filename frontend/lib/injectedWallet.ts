"use client";

import * as React from "react";

type EthereumProviderLike = {
  providers?: EthereumProviderLike[];
};

declare global {
  interface Window {
    ethereum?: EthereumProviderLike;
  }
}

function countInjectedWalletProviders() {
  if (typeof window === "undefined") return 0;

  const ethereum = window.ethereum;
  if (!ethereum) return 0;

  const providers = Array.isArray(ethereum.providers) && ethereum.providers.length > 0 ? ethereum.providers : [ethereum];
  return new Set(providers).size;
}

export function useInjectedWalletAvailability() {
  const [state, setState] = React.useState({ checked: false, count: 0 });

  React.useEffect(() => {
    setState({ checked: true, count: countInjectedWalletProviders() });
  }, []);

  return {
    checked: state.checked,
    injectedWalletCount: state.count,
    hasInjectedWallet: state.count > 0,
  };
}