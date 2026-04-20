"use client";

import * as React from "react";
import { isAddress } from "viem";

import { fetchJson } from "@/lib/api";
import { type PublicUserProfileResponse } from "@/lib/auth";

const profileCache = new Map<string, PublicUserProfileResponse>();
const profileRequestCache = new Map<string, Promise<PublicUserProfileResponse>>();

async function loadSellerProfile(address: string) {
  const normalized = address.toLowerCase();
  const cached = profileCache.get(normalized);
  if (cached) return cached;

  const pending = profileRequestCache.get(normalized);
  if (pending) return pending;

  const request = fetchJson<PublicUserProfileResponse>(`/users/${address}`, { timeoutMs: 5_000 })
    .then((profile) => {
      profileCache.set(normalized, profile);
      profileRequestCache.delete(normalized);
      return profile;
    })
    .catch((error) => {
      profileRequestCache.delete(normalized);
      throw error;
    });

  profileRequestCache.set(normalized, request);
  return request;
}

export function primeSellerProfile(profile: PublicUserProfileResponse | null | undefined) {
  if (!profile?.user?.address) return;
  profileCache.set(profile.user.address.toLowerCase(), profile);
}

export function invalidateSellerProfile(address: string | null | undefined) {
  if (!address) return;
  const normalized = address.toLowerCase();
  profileCache.delete(normalized);
  profileRequestCache.delete(normalized);
}

export function useSellerProfile(address: string | null | undefined) {
  const normalized = typeof address === "string" && isAddress(address) ? address.toLowerCase() : null;
  const [profile, setProfile] = React.useState<PublicUserProfileResponse | null>(() => (normalized ? profileCache.get(normalized) ?? null : null));
  const [isLoading, setIsLoading] = React.useState(Boolean(normalized && !profile));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!normalized || !address) {
        setProfile(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      const cached = profileCache.get(normalized) ?? null;
      setProfile(cached);
      setIsLoading(!cached);
      setError(null);

      if (cached) return;

      try {
        const next = await loadSellerProfile(address);
        if (!cancelled) {
          setProfile(next);
          setError(null);
        }
      } catch (nextError: unknown) {
        if (!cancelled) {
          setError(nextError instanceof Error && nextError.message.trim() ? nextError.message : "Failed to load seller profile");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [address, normalized]);

  return { profile, isLoading, error };
}