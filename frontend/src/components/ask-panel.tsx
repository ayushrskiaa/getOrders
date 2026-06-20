"use client";

import { Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { apiUrl } from "@/lib/api";
import { authFetch } from "@/lib/auth";

const prompts = [
  "How much did I spend this month?",
  "How much did I spend on groceries?",
  "Show my Flipkart electronics orders.",
  "Which orders still have a return window?"
];

export function AskPanel() {
  const [question, setQuestion] = useState(prompts[0]);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await authFetch(apiUrl("/api/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = (await response.json()) as { answer: string };
      setAnswer(data.answer);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-receipt p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-cobalt">Ask AI</p>
          <h2 className="mt-1 text-xl font-black">Query your order history</h2>
        </div>
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-ledger px-3 py-2 text-sm outline-none focus:border-cobalt"
        />
        <button className="inline-flex items-center gap-2 rounded-md bg-cobalt px-3 py-2 text-sm font-semibold text-white">
          <Send size={15} />
          {loading ? "Asking" : "Ask"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setQuestion(prompt)}
            className="rounded-md border border-line bg-ledger px-2 py-1 text-xs hover:border-ink"
          >
            {prompt}
          </button>
        ))}
      </div>
      {answer ? <p className="mt-4 rounded-md bg-mint/30 p-3 text-sm leading-6">{answer}</p> : null}
    </section>
  );
}
