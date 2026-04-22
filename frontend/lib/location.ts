import { type UserProfile } from "@/lib/auth";

export type ProfileLocationFilter = {
  city?: string;
  region?: string;
  postalCode?: string;
};

function normalizeValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getProfileLocationFilter(user?: UserProfile | null): ProfileLocationFilter | null {
  const city = normalizeValue(user?.city);
  const region = normalizeValue(user?.region);
  const postalCode = normalizeValue(user?.postalCode);

  if (city && region) {
    return { city, region };
  }

  if (city) {
    return { city };
  }

  if (region) {
    return { region };
  }

  if (postalCode) {
    return { postalCode };
  }

  return null;
}

export function formatLocationLabel(location?: ProfileLocationFilter | null) {
  if (!location) return "";
  return [location.city, location.region, location.postalCode].filter(Boolean).join(", ");
}