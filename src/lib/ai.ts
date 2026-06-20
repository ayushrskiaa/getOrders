import OpenAI from "openai";
import { getOrders } from "./orders";
import { formatInr } from "./money";

export async function answerOrderQuestion(question: string) {
  const orders = await getOrders({});
  const compactOrders = orders.map((order) => ({
    platform: order.platform,
    date: order.orderedAt.toISOString().slice(0, 10),
    total: Number(order.totalAmount),
    category: order.category,
    status: order.status,
    items: order.items.map((item) => item.name)
  }));

  if (!process.env.OPENAI_API_KEY) {
    return answerWithRules(question, compactOrders);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Answer only from the provided order JSON. If the data is missing, say what is missing. Keep answers short and include INR totals."
      },
      { role: "user", content: `Question: ${question}\nOrders: ${JSON.stringify(compactOrders)}` }
    ],
    temperature: 0.1
  });

  return response.choices[0]?.message.content ?? "I could not answer that from your order data.";
}

function answerWithRules(
  question: string,
  orders: Array<{ platform: string; date: string; total: number; category: string; status: string; items: string[] }>
) {
  const normalized = question.toLowerCase();
  const now = new Date();
  const monthOrders = orders.filter((order) => {
    const date = new Date(order.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });

  if (normalized.includes("grocery") || normalized.includes("groceries")) {
    const total = orders
      .filter((order) => order.category === "GROCERIES")
      .reduce((amount, order) => amount + order.total, 0);
    return `You spent ${formatInr(total)} on groceries across your synced orders.`;
  }

  if (normalized.includes("this month") || normalized.includes("month")) {
    const total = monthOrders.reduce((amount, order) => amount + order.total, 0);
    return `You spent ${formatInr(total)} this month across ${monthOrders.length} synced orders.`;
  }

  if (normalized.includes("flipkart")) {
    const flipkartOrders = orders.filter((order) => order.platform === "FLIPKART");
    return `You have ${flipkartOrders.length} Flipkart orders totaling ${formatInr(
      flipkartOrders.reduce((amount, order) => amount + order.total, 0)
    )}.`;
  }

  if (normalized.includes("return")) {
    return "Open the Returns tab to see orders with visible return windows. Return dates are captured when platforms expose them.";
  }

  return `I found ${orders.length} synced orders totaling ${formatInr(
    orders.reduce((amount, order) => amount + order.total, 0)
  )}. Try asking about monthly spend, groceries, Flipkart, or returns.`;
}
