import { Category, Platform } from "@prisma/client";
import { NextResponse } from "next/server";
import { getOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = parseEnum(Platform, url.searchParams.get("platform"));
  const category = parseEnum(Category, url.searchParams.get("category"));
  const status = url.searchParams.get("status") ?? undefined;
  const invoiceOnly = url.searchParams.get("invoiceOnly") === "true";

  const orders = await getOrders({ platform, category, status, invoiceOnly });

  return NextResponse.json({ orders });
}

function parseEnum<T extends Record<string, string>>(values: T, value: string | null) {
  if (!value) return undefined;
  return Object.values(values).includes(value) ? (value as T[keyof T]) : undefined;
}
