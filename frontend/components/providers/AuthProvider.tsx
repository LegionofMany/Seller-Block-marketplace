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
  isAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (input: { email: string; password: string }) => Promise<void>;
  registerWithEmail: (input: { email: string; password: string; displayName?: string }) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
};

type AuthSessionResponse = {
  token: string;
  address: string;
  user: UserProfile | null;
  isAdmin?: boolean;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address: walletAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = React.useState<string | null>(null);
  const [address, setAddress] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  const applySession = React.useCallback((session: { token: string; address: string; user: UserProfile | null; isAdmin?: boolean }) => {
    setStoredAuthToken(session.token);
    setToken(session.token);
    setAddress(session.address);
    setUser(session.user);
    setIsAdmin(Boolean(session.isAdmin));
  }, []);

  const signOut = React.useCallback(() => {
    clearStoredAuthToken();
    setToken(null);
    setAddress(null);
    setUser(null);
    setIsAdmin(false);
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
      const res = await fetchJson<{ address: string; user: UserProfile | null; isAdmin?: boolean }>("/auth/me", {
        timeoutMs: 7_000,
      });
      setToken(stored);
      setAddress(res.address);
      setUser(res.user);
      setIsAdmin(Boolean(res.isAdmin));
    } catch {
      clearStoredAuthToken();
      setToken(null);
      setAddress(null);
      setUser(null);
      setIsAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!walletAddress || !address) return;
    if (address.startsWith("0x") && walletAddress.toLowerCase() !== address.toLowerCase()) {
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
      const verified = await fetchJson<AuthSessionResponse>("/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          nonce: nonce.nonce,
          signature,
        }),
      });

      applySession(verified);
      toast.success("Signed in");
    } catch (e: any) {
      toast.error(e?.message ?? "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  }, [applySession, walletAddress, signMessageAsync]);

  const signInWithEmail = React.useCallback(async ({ email, password }: { email: string; password: string }) => {
    try {
      setIsLoading(true);
      const verified = await fetchJson<AuthSessionResponse>("/auth/email/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      applySession(verified);
      toast.success("Signed in");
    } catch (e: any) {
      toast.error(e?.message ?? "Email sign in failed");
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  const registerWithEmail = React.useCallback(async ({ email, password, displayName }: { email: string; password: string; displayName?: string }) => {
    try {
      setIsLoading(true);
      const verified = await fetchJson<AuthSessionResponse>("/auth/email/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      applySession(verified);
      toast.success("Account created");
    } catch (e: any) {
      toast.error(e?.message ?? "Email registration failed");
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      token,
      address,
      user,
      isAdmin,
      isLoading,
      isAuthenticated: Boolean(token && address),
      signIn,
      signInWithEmail,
      registerWithEmail,
      signOut,
      refresh,
      setUser,
    }),
    [token, address, user, isAdmin, isLoading, signIn, signInWithEmail, registerWithEmail, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}