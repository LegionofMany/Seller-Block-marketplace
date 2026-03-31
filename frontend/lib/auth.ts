export type UserProfile = {
  address: string;
  displayName?: string | null;
  bio?: string | null;
  avatarCid?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PublicUserProfileResponse = {
  user: UserProfile;
  stats: {
    listingCount: number;
    location: {
      city?: string | null;
      region?: string | null;
      postalCode?: string | null;
    } | null;
    followerCount: number;
    responseRate: number | null;
    reputation: number | null;
  };
};

const AUTH_TOKEN_KEY = "seller-block.auth-token";

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_TOKEN_KEY)?.trim();
  return value?.length ? value : null;
}

export function setStoredAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}