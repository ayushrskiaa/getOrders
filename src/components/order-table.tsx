import { ExternalLink, FileDown } from "lucide-react";
import { format } from "date-fns";
import { categoryLabel } from "@/lib/categories";
import { formatInr } from "@/lib/money";

type OrderRow = {
  id: string;
  platform: string;
  externalOrderId: string;
  orderedAt: string;
  totalAmount: number;
  status: string;
  category: string;
  invoiceUrl: string | null;
  returnBy: string | null;
  items: { name: string; quantity: number }[];
};

export function OrderTable({ orders }: { orders: OrderRow[] }) {
  return (
    <section className="rounded-lg border border-line bg-receipt shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-coral">Orders</p>
          <h2 className="mt-1 text-xl font-black">Unified timeline</h2>
        </div>
        <a
          href="/api/export/orders.csv"
          className="inline-flex items-center gap-2 rounded-md border border-ink bg-ledger px-3 py-2 text-sm font-semibold hover:bg-mint/30"
        >
          <FileDown size={15} />
          Export CSV
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-ledger/70 text-left font-mono text-xs uppercase tracking-wide">
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Items</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-line/70 align-top last:border-b-0">
                <td className="px-5 py-4">
                  <div className="font-bold">{order.platform}</div>
                  <div className="mt-1 font-mono text-xs text-ink/60">{order.externalOrderId}</div>
                  {order.invoiceUrl ? (
                    <a
                      href={order.invoiceUrl}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cobalt"
                    >
                      Invoice <ExternalLink size={12} />
                    </a>
                  ) : null}
                </td>
                <td className="px-5 py-4">{format(new Date(order.orderedAt), "dd MMM yyyy")}</td>
                <td className="max-w-[280px] px-5 py-4">
                  {order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                </td>
                <td className="px-5 py-4">{categoryLabel(order.category as never)}</td>
                <td className="px-5 py-4">
                  <span className="rounded-md border border-line bg-ledger px-2 py-1 text-xs font-semibold">
                    {order.status}
                  </span>
                  {order.returnBy ? (
                    <div className="mt-2 text-xs text-coral">
                      Return by {format(new Date(order.returnBy), "dd MMM")}
                    </div>
                  ) : null}
                </td>
                <td className="px-5 py-4 text-right font-black">{formatInr(order.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
