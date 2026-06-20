import { Category, Platform } from "@prisma/client";
import { Activity, Boxes, CalendarClock, IndianRupee, PackageCheck, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { AskPanel } from "@/components/ask-panel";
import { OrderTable } from "@/components/order-table";
import { getAnalyticsSummary } from "@/lib/analytics";
import { categoryLabel } from "@/lib/categories";
import { formatInr } from "@/lib/money";
import { ensureAppUser, getOrders } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { getAppUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

const platformCopy: Record<Platform, { name: string; hint: string }> = {
  AMAZON: { name: "Amazon", hint: "Orders, invoices, returns" },
  FLIPKART: { name: "Flipkart", hint: "Electronics, fashion, delivery state" },
  ZEPTO: { name: "Zepto", hint: "Groceries and quick-commerce spend" }
};

export default async function Home() {
  await ensureAppUser();
  const userId = getAppUserId();
  const [accounts, orders, summary] = await Promise.all([
    prisma.connectedAccount.findMany({ where: { userId }, orderBy: { platform: "asc" } }),
    getOrders({}),
    getAnalyticsSummary()
  ]);

  const serializableOrders = orders.map((order) => ({
    id: order.id,
    platform: platformCopy[order.platform].name,
    externalOrderId: order.externalOrderId,
    orderedAt: order.orderedAt.toISOString(),
    totalAmount: Number(order.totalAmount),
    status: order.status,
    category: order.category,
    invoiceUrl: order.invoiceUrl,
    returnBy: order.returnBy?.toISOString() ?? null,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity }))
  }));

  const bestCategory = Object.entries(summary.byCategory)
    .filter(([category]) => category !== Category.OTHER)
    .sort(([, amountA], [, amountB]) => amountB - amountA)[0];

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 border-b-2 border-ink pb-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-ink bg-mint px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide">
                <ShieldCheck size={14} />
                Read-only order intelligence
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-none sm:text-6xl">
                All your orders, receipts, and returns in one ledger.
              </h1>
            </div>
            <div className="w-full max-w-sm rounded-lg border-2 border-ink bg-receipt p-4 shadow-[7px_7px_0_#151716]">
              <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Live sync</p>
              <p className="mt-2 text-sm leading-6">
                Connect Amazon, Flipkart, or Zepto through Anakin, sync recent orders, then ask questions or export the
                unified CSV.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <MetricCard icon={<IndianRupee size={18} />} label="This month" value={formatInr(summary.monthSpend)} />
          <MetricCard icon={<PackageCheck size={18} />} label="Synced orders" value={String(summary.totalOrders)} />
          <MetricCard
            icon={<CalendarClock size={18} />}
            label="Return windows"
            value={`${summary.upcomingReturns} active`}
          />
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-line bg-receipt p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-cobalt">Connections</p>
                <h2 className="mt-1 text-xl font-black">Commerce accounts</h2>
              </div>
              <Activity size={20} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {Object.values(Platform).map((platform) => {
                const account = accounts.find((item) => item.platform === platform);
                return (
                  <div key={platform} className="rounded-lg border border-line bg-ledger p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black">{platformCopy[platform].name}</h3>
                        <p className="mt-1 text-xs leading-5 text-ink/65">{platformCopy[platform].hint}</p>
                      </div>
                      <span className="rounded-md bg-receipt px-2 py-1 font-mono text-[10px] uppercase">
                        {account ? account.status.replace("_", " ") : "Not connected"}
                      </span>
                    </div>
                    <div className="mt-4">
                      <ActionButton platform={platform} accountId={account?.id} status={account?.status} />
                    </div>
                    {account?.lastError ? <p className="mt-3 text-xs leading-5 text-coral">{account.lastError}</p> : null}
                    {account?.lastSyncedAt ? (
                      <p className="mt-3 text-xs text-ink/60">
                        Last sync {account.lastSyncedAt.toLocaleDateString("en-IN")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-receipt p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-coral">Spend shape</p>
                <h2 className="mt-1 text-xl font-black">Category mix</h2>
              </div>
              <Boxes size={20} />
            </div>
            <div className="space-y-3">
              {Object.entries(summary.byCategory)
                .filter(([, amount]) => amount > 0)
                .map(([category, amount]) => (
                  <div key={category}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{categoryLabel(category as Category)}</span>
                      <span className="font-bold">{formatInr(amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-line">
                      <div
                        className="h-2 rounded-full bg-coral"
                        style={{ width: `${Math.max(8, (amount / Math.max(summary.totalSpend, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
            <p className="mt-4 rounded-md bg-mint/25 p-3 text-sm">
              {bestCategory
                ? `${categoryLabel(bestCategory[0] as Category)} is currently your largest synced category.`
                : "Sync orders to see category-level spending."}
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
          <OrderTable orders={serializableOrders} />
          <AskPanel />
        </section>
      </div>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-receipt p-5 shadow-sm">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border border-ink bg-ledger">{icon}</div>
      <p className="font-mono text-xs uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}
