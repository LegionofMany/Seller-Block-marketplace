"use client";

import * as React from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api";
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken, type UserProfile } from "@/lib/auth";

type AuthContextValue = {
  token: string | null;
  address: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address: walletAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = React.useState<string | null>(null);
  const [address, setAddress] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const signOut = React.useCallback(() => {
    clearStoredAuthToken();
    setToken(null);
    setAddress(null);
    setUser(null);
  }, []);

  const refresh = React.useCallback(async () => {
    const stored = getStoredAuthToken();
    if (!stored) {
      setToken(null);
      setAddress(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetchJson<{ address: string; user: UserProfile | null }>("/auth/me", {
        timeoutMs: 7_000,
      });
      setToken(stored);
      setAddress(res.address);
      setUser(res.user);
    } catch {
      clearStoredAuthToken();
      setToken(null);
      setAddress(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!walletAddress || !address) return;
    if (walletAddress.toLowerCase() !== address.toLowerCase()) {
      signOut();
    }
  }, [walletAddress, address, signOut]);

  const signIn = React.useCallback(async () => {
    if (!walletAddress) {
      toast.error("Connect your wallet first");
      return;
    }

    try {
      setIsLoading(true);
      const nonce = await fetchJson<{ address: string; nonce: string; message: string }>("/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });

      const signature = await signMessageAsync({ message: nonce.message });
      const verified = await fetchJson<{ token: string; address: string; user: UserProfile | null }>("/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          nonce: nonce.nonce,
          signature,
        }),
      });

      setStoredAuthToken(verified.token);
      setToken(verified.token);
      setAddress(verified.address);
      setUser(verified.user);
      toast.success("Signed in");
    } catch (e: any) {
      toast.error(e?.message ?? "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signMessageAsync]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      token,
      address,
      user,
      isLoading,
      isAuthenticated: Boolean(token && address),
      signIn,
      signOut,
      refresh,
      setUser,
    }),
    [token, address, user, isLoading, signIn, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}