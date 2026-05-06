import * as React from "react";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { fetchJson } from "@/lib/api";

const AIRDROP_STORAGE_KEY = "zonycs_airdrop_claimed";

function hasClaimedAirdrop(address: string): boolean {
  try {
    const raw = localStorage.getItem(AIRDROP_STORAGE_KEY);
    if (!raw) return false;
    const claimed: string[] = JSON.parse(raw);
    return claimed.includes(address.toLowerCase());
  } catch {
    return false;
  }
}

function markAirdropClaimed(address: string): void {
  try {
    const raw = localStorage.getItem(AIRDROP_STORAGE_KEY);
    const claimed: string[] = raw ? JSON.parse(raw) : [];
    if (!claimed.includes(address.toLowerCase())) {
      claimed.push(address.toLowerCase());
      localStorage.setItem(AIRDROP_STORAGE_KEY, JSON.stringify(claimed));
    }
  } catch {
    // ignore
  }
}

export function useWalletAirdrop() {
  const { address, isConnected } = useAccount();
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [hasClaimed, setHasClaimed] = React.useState(false);

  React.useEffect(() => {
    if (!address || !isConnected) return;
    setHasClaimed(hasClaimedAirdrop(address));
  }, [address, isConnected]);

  React.useEffect(() => {
    if (!address || !isConnected || hasClaimed || isClaiming) {
      return;
    }
    if (hasClaimedAirdrop(address)) {
      setHasClaimed(true);
      return;
    }

    let cancelled = false;

    async function claimAirdrop() {
      if (!address) return;
      try {
        setIsClaiming(true);
        await fetchJson("/airdrop/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
          timeoutMs: 10_000,
        });

        if (!cancelled) {
          markAirdropClaimed(address);
          setHasClaimed(true);
          toast.success("Welcome to Zonycs! Test tokens have been sent to your wallet.", {
            duration: 6000,
          });
        }
      } catch (error: unknown) {
        // Silently skip 404 — airdrop endpoint not yet
        // deployed on this backend instance
        const is404 =
          error instanceof Error &&
          error.message.includes("404");
        if (!cancelled) {
          if (!is404) {
            // Only mark as claimed on real network errors
            // so we retry next time
            console.warn("[airdrop] claim failed:", error);
          } else {
            // 404 means endpoint not deployed yet —
            // mark as claimed so we don't spam the console
            markAirdropClaimed(address ?? "");
            setHasClaimed(true);
          }
          setIsClaiming(false);
        }
      } finally {
        if (!cancelled) setIsClaiming(false);
      }
    }

    void claimAirdrop();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, hasClaimed, isClaiming]);

  return { isClaiming, hasClaimed };
}
