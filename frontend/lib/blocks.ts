function keyFor(blocker?: string | null): string {
  const b = (blocker ?? "anon").toLowerCase();
  return `blockedSellers:${b}`;
}

export function getBlockedSellers(blocker?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(blocker));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v).toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

export function addBlockedSeller(blocker: string | null | undefined, seller: string): void {
  if (typeof window === "undefined") return;
  const next = new Set(getBlockedSellers(blocker));
  next.add(String(seller).toLowerCase());
  window.localStorage.setItem(keyFor(blocker), JSON.stringify(Array.from(next)));
}
