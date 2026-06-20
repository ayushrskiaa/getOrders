import { Category, Platform } from "@prisma/client";
import { prisma } from "./prisma";
import { getAppUserId } from "./user";

export async function getAnalyticsSummary() {
  const userId = getAppUserId();
  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { orderedAt: "desc" }
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalSpend = sum(orders.map((order) => Number(order.totalAmount)));
  const monthSpend = sum(
    orders
      .filter((order) => order.orderedAt.getMonth() === currentMonth && order.orderedAt.getFullYear() === currentYear)
      .map((order) => Number(order.totalAmount))
  );

  const byPlatform = Object.fromEntries(
    Object.values(Platform).map((platform) => [
      platform,
      sum(orders.filter((order) => order.platform === platform).map((order) => Number(order.totalAmount)))
    ])
  ) as Record<Platform, number>;

  const byCategory = Object.fromEntries(
    Object.values(Category).map((category) => [
      category,
      sum(orders.filter((order) => order.category === category).map((order) => Number(order.totalAmount)))
    ])
  ) as Record<Category, number>;

  const upcomingReturns = orders.filter((order) => {
    if (!order.returnBy) return false;
    const days = (order.returnBy.getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 14;
  });

  return {
    totalOrders: orders.length,
    totalSpend,
    monthSpend,
    byPlatform,
    byCategory,
    upcomingReturns: upcomingReturns.length,
    latestOrderAt: orders[0]?.orderedAt ?? null
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
