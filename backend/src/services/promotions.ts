import Stripe from "stripe";

import { HttpError } from "../middlewares/errors";
import { getContext } from "./context";

export type PromotionType = "bump" | "top" | "featured";

type PromotionConfig = {
  type: PromotionType;
  label: string;
  description: string;
  priority: number;
  amountCents: number;
  durationHours: number;
};

let stripeClient: Stripe | null = null;

export function getPromotionConfigs(): PromotionConfig[] {
  const { env } = getContext();
  return [
    {
      type: "bump",
      label: "Bump",
      description: "Boost this listing above standard results for one day.",
      priority: 1,
      amountCents: env.promotionBumpPriceCents,
      durationHours: env.promotionBumpDurationHours,
    },
    {
      type: "top",
      label: "Top placement",
      description: "Keep this listing ahead of regular results for multiple days.",
      priority: 2,
      amountCents: env.promotionTopPriceCents,
      durationHours: env.promotionTopDurationHours,
    },
    {
      type: "featured",
      label: "Featured",
      description: "Highlight this listing with the strongest ranking priority and featured styling.",
      priority: 3,
      amountCents: env.promotionFeaturedPriceCents,
      durationHours: env.promotionFeaturedDurationHours,
    },
  ];
}

export function getPromotionConfig(type: string): PromotionConfig {
  const config = getPromotionConfigs().find((entry) => entry.type === type);
  if (!config) {
    throw new HttpError(400, "Invalid promotion type", "INVALID_PROMOTION_TYPE");
  }
  return config;
}

export function getStripeClient(): Stripe {
  const { env } = getContext();
  if (!env.stripeSecretKey) {
    throw new HttpError(503, "Stripe is not configured", "STRIPE_NOT_CONFIGURED");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return stripeClient;
}