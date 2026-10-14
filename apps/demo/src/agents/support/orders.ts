import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

export const Order = z.object({
  orderId: z.string(),
  customer: z.email(),
  item: z.string(),
  totalUsd: z.number().positive(),
});
export type Order = z.infer<typeof Order>;

export interface Refund {
  orderId: string;
  customer: string;
  amountUsd: number;
  reason: string;
}

export const ORDERS_FILE = join(import.meta.dirname, "..", "..", "..", "seed", "orders.json");

export function loadOrders(file = ORDERS_FILE): Order[] {
  return z.array(Order).parse(JSON.parse(readFileSync(file, "utf8")));
}
