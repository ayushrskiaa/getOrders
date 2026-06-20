import { Category, Platform } from "@prisma/client";

export type ExtractedOrderItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  category?: Category;
  productUrl?: string;
  raw?: unknown;
};

export type ExtractedOrder = {
  platform: Platform;
  externalOrderId: string;
  orderedAt: Date;
  totalAmount: number;
  currency: string;
  status: string;
  category?: Category;
  invoiceUrl?: string;
  returnBy?: Date;
  items: ExtractedOrderItem[];
  raw?: unknown;
};
