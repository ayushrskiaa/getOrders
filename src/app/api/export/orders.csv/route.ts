import { getOrders } from "@/lib/orders";
import { escapeCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const orders = await getOrders({});
  const header = ["Platform", "Order ID", "Date", "Status", "Category", "Total", "Currency", "Items", "Invoice URL"];
  const rows = orders.map((order) => [
    order.platform,
    order.externalOrderId,
    order.orderedAt.toISOString().slice(0, 10),
    order.status,
    order.category,
    Number(order.totalAmount).toFixed(2),
    order.currency,
    order.items.map((item) => `${item.name} x${item.quantity}`).join("; "),
    order.invoiceUrl ?? ""
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=orderhub-orders.csv"
    }
  });
}
