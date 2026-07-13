import "server-only";
import Stripe from "stripe";
import { requireStripeEnv } from "@/lib/env";

let cached: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!cached) {
    const { secretKey } = requireStripeEnv();
    cached = new Stripe(secretKey);
  }
  return cached;
}
