"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useWalletClient } from "wagmi";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import { shortenHex } from "@/lib/format";

type ConversationSummary = {
  id: number;
  listingId?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  counterparty?: string | null;
  lastMessageBody?: string | null;
  lastMessageAt?: number | null;
  messageCount?: number;
};

type MessageItem = {
  id: number;
  conversationId: number;
  sender: string;
  body: string;
  createdAt: number;
};

const MESSAGE_PAGE_SIZE = 50;

export default function MessagesPage() {
  const auth = useAuth();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isLoadingConversations, setIsLoadingConversations] = React.useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = React.useState(false);
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedConversation = React.useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const lastMessageAt = messages.length ? messages[messages.length - 1].createdAt : 0;
  const oldestMessageId = messages.length ? messages[0].id : null;

  async function loadConversations() {
    if (!auth.isAuthenticated) return;
    try {
      setIsLoadingConversations(true);
      const res = await fetchJson<{ items: ConversationSummary[] }>("/messages/conversations", { timeoutMs: 10_000 });
      setConversations(res.items);

      const urlConversation = Number(searchParams.get("conversation") ?? "");
      if (Number.isFinite(urlConversation) && urlConversation > 0) {
        setSelectedId(urlConversation);
      } else if (!selectedId && res.items[0]) {
        setSelectedId(res.items[0].id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load conversations");
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: number, opts?: { since?: number; beforeId?: number; replace?: boolean }) {
    if (!auth.isAuthenticated) return;
    try {
      const since = opts?.since;
      const beforeId = opts?.beforeId;
      const replace = opts?.replace ?? false;

      if (beforeId) {
        setIsLoadingOlderMessages(true);
      } else if (!since) {
        setIsLoadingMessages(true);
      }

      const sp = new URLSearchParams();
      sp.set("limit", String(MESSAGE_PAGE_SIZE));
      if (since) sp.set("since", String(since));
      if (beforeId) sp.set("beforeId", String(beforeId));
      const query = `?${sp.toString()}`;
      const res = await fetchJson<{ items: MessageItem[] }>(`/messages/conversations/${conversationId}/messages${query}`, {
        timeoutMs: 10_000,
      });

      if (!since) {
        setHasOlderMessages(res.items.length >= MESSAGE_PAGE_SIZE);
      }

      setMessages((current) => {
        if (replace) return res.items;
        if (beforeId) {
          const seen = new Set(current.map((item) => item.id));
          const prepended = res.items.filter((item) => !seen.has(item.id));
          setHasOlderMessages(prepended.length >= MESSAGE_PAGE_SIZE);
          return prepended.length ? [...prepended, ...current] : current;
        }
        if (!since) return res.items;
        const seen = new Set(current.map((item) => item.id));
        const appended = res.items.filter((item) => !seen.has(item.id));
        return appended.length ? [...current, ...appended] : current;
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load messages");
    } finally {
      setIsLoadingMessages(false);
      setIsLoadingOlderMessages(false);
    }
  }

  React.useEffect(() => {
    void loadConversations();
  }, [auth.isAuthenticated]);

  React.useEffect(() => {
    const queryConversation = Number(searchParams.get("conversation") ?? "");
    if (Number.isFinite(queryConversation) && queryConversation > 0) {
      setSelectedId(queryConversation);
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setHasOlderMessages(false);
      return;
    }
    void loadMessages(selectedId, { replace: true });
  }, [selectedId]);

  React.useEffect(() => {
    if (!selectedId || !auth.isAuthenticated) return;
    const interval = window.setInterval(() => {
      void loadMessages(selectedId, { since: lastMessageAt || undefined });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [selectedId, auth.isAuthenticated, lastMessageAt]);

  async function loadOlderMessages() {
    if (!selectedId || !oldestMessageId || isLoadingOlderMessages) return;
    await loadMessages(selectedId, { beforeId: oldestMessageId });
  }

  async function sendMessage() {
    if (!selectedId || !draft.trim()) return;
    try {
      const res = await fetchJson<{ item: MessageItem }>(`/messages/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
        timeoutMs: 10_000,
      });
      setDraft("");
      setMessages((current) => [...current, res.item]);
      await loadConversations();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send message");
    }
  }

  async function blockCounterparty() {
    if (!selectedConversation?.counterparty || !address || !walletClient) {
      toast.error("Connect your wallet to block this user");
      return;
    }

    const blocker = address;
    const blocked = selectedConversation.counterparty;
    const issuedAt = Date.now();
    const message = [
      "Seller-Block Marketplace",
      "Action: Block user",
      `Blocker: ${blocker}`,
      `Blocked: ${blocked}`,
      `IssuedAt: ${new Date(issuedAt).toISOString()}`,
    ].join("\n");

    try {
      const signature = await walletClient.signMessage({ message });
      await fetchJson<{ ok: true }>("/safety/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocker, blocked, signature, issuedAt }),
        timeoutMs: 7_000,
      });
      toast.success("User blocked");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to block user");
    }
  }

  async function reportConversation() {
    if (!selectedConversation) return;
    const reason = window.prompt("Report reason: spam, prohibited, scam, duplicate, harassment, other", "spam")?.trim().toLowerCase();
    if (!reason) return;
    try {
      await fetchJson<{ ok: true }>("/safety/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "conversation",
          targetId: String(selectedConversation.id),
          reason,
        }),
      });
      toast.success("Conversation reported");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to report conversation");
    }
  }

  async function reportMessage(messageId: number) {
    const reason = window.prompt("Report reason: spam, prohibited, scam, duplicate, harassment, other", "spam")?.trim().toLowerCase();
    if (!reason) return;
    try {
      await fetchJson<{ ok: true }>("/safety/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "message",
          targetId: String(messageId),
          reason,
        }),
      });
      toast.success("Message reported");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to report message");
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>Connect your wallet and complete wallet sign-in to use Kijiji-style messaging.</CardDescription>
        </CardHeader>
        <CardContent>
          {address ? (
            <Button type="button" size="lg" onClick={() => void auth.signIn()} disabled={auth.isLoading}>
              Sign in
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">Connect your wallet first.</div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Your buyer and seller conversations.</p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
            <CardDescription>{isLoadingConversations ? "Loading…" : `${conversations.length} conversation(s)`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {conversations.length === 0 ? (
              <div className="text-sm text-muted-foreground">No conversations yet. Start from a listing page.</div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={
                    conversation.id === selectedId
                      ? "w-full rounded-md border bg-accent p-3 text-left"
                      : "w-full rounded-md border p-3 text-left hover:bg-accent/40"
                  }
                  onClick={() => {
                    setSelectedId(conversation.id);
                    router.replace(`/messages?conversation=${conversation.id}`);
                  }}
                >
                  <div className="font-medium">{conversation.counterparty ? shortenHex(conversation.counterparty) : `Conversation #${conversation.id}`}</div>
                  <div className="truncate text-xs text-muted-foreground">{conversation.lastMessageBody || "No messages yet"}</div>
                  {conversation.listingId ? <div className="mt-1 truncate text-[11px] text-muted-foreground">Listing: {conversation.listingId}</div> : null}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedConversation?.counterparty ? shortenHex(selectedConversation.counterparty) : "Select a conversation"}</CardTitle>
            <CardDescription>
              {selectedConversation?.listingId ? (
                <Link className="underline" href={`/listing/${selectedConversation.listingId}`}>
                  Open listing
                </Link>
              ) : (
                "Messages refresh automatically using polling."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedConversation ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={blockCounterparty}>Block user</Button>
                <Button type="button" variant="outline" size="sm" onClick={reportConversation}>Report conversation</Button>
              </div>
            ) : null}

            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-md border p-3">
              {!selectedConversation ? (
                <div className="text-sm text-muted-foreground">Choose a conversation to view messages.</div>
              ) : isLoadingMessages ? (
                <div className="text-sm text-muted-foreground">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
              ) : (
                <>
                  {hasOlderMessages ? (
                    <div className="pb-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadOlderMessages()} disabled={isLoadingOlderMessages}>
                        {isLoadingOlderMessages ? "Loading…" : "Load older messages"}
                      </Button>
                    </div>
                  ) : null}

                  {messages.map((item) => {
                    const mine = auth.address?.toLowerCase() === item.sender.toLowerCase();
                    return (
                      <div key={item.id} className={mine ? "ml-auto max-w-[85%] rounded-md bg-accent p-3" : "max-w-[85%] rounded-md border p-3"}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                          <span>{mine ? "You" : shortenHex(item.sender)}</span>
                          <button type="button" className="underline" onClick={() => void reportMessage(item.id)}>
                            Report
                          </button>
                        </div>
                        <div className="whitespace-pre-wrap text-sm">{item.body}</div>
                        <div className="mt-2 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {selectedConversation ? (
              <div className="space-y-3">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" />
                <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => void sendMessage()}>
                  Send message
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}