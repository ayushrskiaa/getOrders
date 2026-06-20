"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Boxes, CalendarClock, IndianRupee, PackageCheck, ShieldCheck, LogOut, Loader2 } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { AskPanel } from "@/components/ask-panel";
import { OrderTable } from "@/components/order-table";
import { categoryLabel } from "@/lib/categories";
import { formatInr } from "@/lib/money";
import { apiUrl } from "@/lib/api";
import { authFetch, removeToken, getToken } from "@/lib/auth";
import { platforms, type Platform } from "@/lib/platform";
import type { Category } from "@/lib/categories";

const platformCopy: Record<Platform, { name: string; hint: string }> = {
  AMAZON: { name: "Amazon", hint: "Orders, invoices, returns" },
  FLIPKART: { name: "Flipkart", hint: "Electronics, fashion, delivery state" },
  ZEPTO: { name: "Zepto", hint: "Groceries and quick-commerce spend" }
};

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
}

interface Account {
  id: string;
  platform: Platform;
  status: string;
  lastError?: string | null;
  lastSyncedAt?: string | null;
}

interface Order {
  id: string;
  platform: Platform;
  externalOrderId: string;
  orderedAt: string;
  totalAmount: number;
  status: string;
  category: Category;
  invoiceUrl: string | null;
  returnBy: string | null;
  items: { name: string; quantity: number }[];
}

interface Summary {
  totalOrders: number;
  totalSpend: number;
  monthSpend: number;
  byCategory: Record<string, number>;
  upcomingReturns: number;
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalOrders: 0,
    totalSpend: 0,
    monthSpend: 0,
    byCategory: {},
    upcomingReturns: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    async function loadData() {
      try {
        setError(null);
        // Load Profile
        const userRes = await authFetch(apiUrl("/api/auth/me"));
        if (!userRes.ok) {
          throw new Error("Failed to load profile");
        }
        const userData = await userRes.json();
        setUser(userData.user);

        // Load Accounts, Orders, Summary
        const [accountsRes, ordersRes, summaryRes] = await Promise.all([
          authFetch(apiUrl("/api/accounts")),
          authFetch(apiUrl("/api/orders")),
          authFetch(apiUrl("/api/analytics/summary"))
        ]);

        if (!accountsRes.ok || !ordersRes.ok || !summaryRes.ok) {
          throw new Error("Failed to load dashboard data");
        }

        const [accountsData, ordersData, summaryData] = await Promise.all([
          accountsRes.json(),
          ordersRes.json(),
          summaryRes.json()
        ]);

        setAccounts(accountsData.accounts || []);
        setOrders(ordersData.orders || []);
        setSummary(summaryData);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  function handleLogout() {
    removeToken();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-ledger">
        <div className="text-center font-mono font-bold text-ink">
          <Loader2 className="animate-spin text-cobalt mx-auto mb-4" size={40} />
          <p>Loading your Order Ledger...</p>
        </div>
      </main>
    );
  }

  const serializableOrders = orders.map((order) => ({
    id: order.id,
    platform: platformCopy[order.platform]?.name || order.platform,
    externalOrderId: order.externalOrderId,
    orderedAt: order.orderedAt,
    totalAmount: Number(order.totalAmount),
    status: order.status,
    category: order.category,
    invoiceUrl: order.invoiceUrl,
    returnBy: order.returnBy,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity }))
  }));

  const bestCategory = Object.entries(summary.byCategory)
    .filter(([category]) => category !== "OTHER")
    .sort(([, amountA], [, amountB]) => amountB - amountA)[0];

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 bg-ledger">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 border-b-2 border-ink pb-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-ink bg-mint px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide">
              <ShieldCheck size={14} />
              Unified order intelligence
            </div>
            
            {user && (
              <div className="flex items-center gap-3 rounded-lg border-2 border-ink bg-receipt px-4 py-2 shadow-[3px_3px_0_#151716] font-mono text-xs">
                <span className="font-bold text-ink">
                  Logged in: <span className="text-cobalt">{user.name || user.email}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 font-black text-coral hover:underline hover:text-ink transition-colors ml-2"
                >
                  <LogOut size={12} />
                  Log out
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-black leading-none sm:text-6xl text-ink">
                All your orders, receipts, and returns in one ledger.
              </h1>
            </div>
            <div className="w-full max-w-sm rounded-lg border-2 border-ink bg-receipt p-4 shadow-[7px_7px_0_#151716]">
              <p className="font-mono text-xs uppercase tracking-wide text-ink/60">Live sync</p>
              <p className="mt-2 text-sm leading-6 text-ink">
                Connect Amazon, Flipkart, or Zepto through Anakin, sync recent orders, then ask questions or export the
                unified CSV.
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 border-2 border-coral bg-coral/10 rounded-lg text-ink font-mono text-sm">
            Error loading data: {error}
          </div>
        )}

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
                <h2 className="mt-1 text-xl font-black text-ink">Commerce accounts</h2>
              </div>
              <Activity size={20} className="text-ink" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {platforms.map((platform) => {
                const account = accounts.find((item) => item.platform === platform);
                return (
                  <div key={platform} className="rounded-lg border border-line bg-ledger p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-black text-ink">{platformCopy[platform].name}</h3>
                        <span className="rounded-md bg-receipt px-2 py-1 font-mono text-[10px] uppercase border border-line text-ink">
                          {account ? account.status.replace("_", " ") : "Not connected"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-ink/65">{platformCopy[platform].hint}</p>
                    </div>
                    <div>
                      <div className="mt-4">
                        <ActionButton platform={platform} accountId={account?.id} status={account?.status} />
                      </div>
                      {account?.lastError ? <p className="mt-3 text-xs leading-5 text-coral">{account.lastError}</p> : null}
                      {account?.lastSyncedAt ? (
                        <p className="mt-3 text-xs text-ink/60 font-mono">
                          Last sync {new Date(account.lastSyncedAt).toLocaleDateString("en-IN")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-receipt p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-coral">Spend shape</p>
                <h2 className="mt-1 text-xl font-black text-ink">Category mix</h2>
              </div>
              <Boxes size={20} className="text-ink" />
            </div>
            <div className="space-y-3">
              {Object.entries(summary.byCategory)
                .filter(([, amount]) => amount > 0)
                .map(([category, amount]) => (
                  <div key={category}>
                    <div className="mb-1 flex justify-between text-sm text-ink">
                      <span>{categoryLabel(category as Category)}</span>
                      <span className="font-bold">{formatInr(amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-line">
                      <div
                        className="h-2 rounded-full bg-coral animate-pulse"
                        style={{ width: `${Math.max(8, (amount / Math.max(summary.totalSpend, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              {Object.entries(summary.byCategory).filter(([, amount]) => amount > 0).length === 0 && (
                <p className="text-sm text-ink/60 font-mono italic">No spending data synced yet.</p>
              )}
            </div>
            <p className="mt-4 rounded-md bg-mint/25 p-3 text-sm text-ink">
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
    <div className="rounded-lg border-2 border-ink bg-receipt p-5 shadow-[4px_4px_0_#151716] transition hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#151716]">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border border-ink bg-ledger text-ink">{icon}</div>
      <p className="font-mono text-xs uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-3xl font-black text-ink">{value}</p>
    </div>
  );
}
