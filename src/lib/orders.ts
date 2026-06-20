import { Category, Platform, Prisma, SyncStatus } from "@prisma/client";
import { inferCategory } from "./categories";
import { prisma } from "./prisma";
import { getAppUserId } from "./user";
import type { ExtractedOrder } from "./types";

export async function ensureAppUser() {
  const userId = getAppUserId();

  return prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: "local@orderhub.local", name: "Local User" },
    update: {}
  });
}

export async function upsertExtractedOrders(userId: string, orders: ExtractedOrder[]) {
  let count = 0;

  for (const extracted of orders) {
    const itemText = extracted.items.map((item) => item.name).join(" ");
    const category = extracted.category ?? inferCategory(itemText);

    await prisma.order.upsert({
      where: {
        userId_platform_externalOrderId: {
          userId,
          platform: extracted.platform,
          externalOrderId: extracted.externalOrderId
        }
      },
      create: {
        userId,
        platform: extracted.platform,
        externalOrderId: extracted.externalOrderId,
        orderedAt: extracted.orderedAt,
        totalAmount: new Prisma.Decimal(extracted.totalAmount),
        currency: extracted.currency,
        status: extracted.status,
        category,
        invoiceUrl: extracted.invoiceUrl,
        returnBy: extracted.returnBy,
        raw: sanitizeJson(extracted.raw ?? extracted),
        items: {
          create: extracted.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            category: item.category ?? inferCategory(item.name),
            productUrl: item.productUrl,
            raw: sanitizeJson(item.raw ?? item)
          }))
        },
        invoices: extracted.invoiceUrl
          ? { create: { url: extracted.invoiceUrl, label: `${extracted.platform} invoice` } }
          : undefined
      },
      update: {
        orderedAt: extracted.orderedAt,
        totalAmount: new Prisma.Decimal(extracted.totalAmount),
        currency: extracted.currency,
        status: extracted.status,
        category,
        invoiceUrl: extracted.invoiceUrl,
        returnBy: extracted.returnBy,
        raw: sanitizeJson(extracted.raw ?? extracted),
        items: {
          deleteMany: {},
          create: extracted.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            category: item.category ?? inferCategory(item.name),
            productUrl: item.productUrl,
            raw: sanitizeJson(item.raw ?? item)
          }))
        },
        invoices: extracted.invoiceUrl
          ? {
              deleteMany: {},
              create: { url: extracted.invoiceUrl, label: `${extracted.platform} invoice` }
            }
          : { deleteMany: {} }
      }
    });
    count += 1;
  }

  return count;
}

export async function getOrders(filters: {
  platform?: Platform;
  category?: Category;
  status?: string;
  invoiceOnly?: boolean;
}) {
  const userId = getAppUserId();

  return prisma.order.findMany({
    where: {
      userId,
      platform: filters.platform,
      category: filters.category,
      status: filters.status,
      invoiceUrl: filters.invoiceOnly ? { not: null } : undefined
    },
    include: { items: true, invoices: true },
    orderBy: { orderedAt: "desc" }
  });
}

export async function createSyncJob(accountId: string) {
  const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: accountId } });

  return prisma.syncJob.create({
    data: {
      userId: account.userId,
      accountId: account.id,
      platform: account.platform,
      status: SyncStatus.PENDING
    }
  });
}

function sanitizeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
