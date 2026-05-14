"use client";

import * as React from "react";
import { fetchJson } from "@/lib/api";

export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  readAt: number | null;
  createdAt: number;
  payload?: {
    href?: string;
    listingId?: string;
    chainKey?: string;
    savedSearchId?: string;
    marketplaceHref?: string;
    [key: string]: unknown;
  };
};

type NotificationsResponse = {
  items: NotificationItem[];
  unreadCount: number;
};

const POLL_INTERVAL_MS = 60_000; // poll every 60 s

export function useNotifications(enabled: boolean) {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchNotifications = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await fetchJson<NotificationsResponse>("/notifications?limit=15", {
        timeoutMs: 8_000,
      });
      setItems(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently ignore — network blips shouldn't crash the bell
    }
  }, [enabled]);

  // Initial load + polling
  React.useEffect(() => {
    if (!enabled) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    setIsLoading(true);
    void fetchNotifications().finally(() => setIsLoading(false));
    const timer = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, fetchNotifications]);

  const markRead = React.useCallback(
    async (id: number) => {
      try {
        await fetchJson(`/notifications/${id}/read`, { method: "POST" });
        setItems((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readAt: Date.now() } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // ignore
      }
    },
    []
  );

  const markAllRead = React.useCallback(async () => {
    try {
      await fetchJson("/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  return { items, unreadCount, isLoading, markRead, markAllRead, refresh: fetchNotifications };
}
