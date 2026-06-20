"use client";

import { Cable, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { apiUrl } from "@/lib/api";
import type { Platform } from "@/lib/platform";

type ActionButtonProps = {
  accountId?: string;
  platform: Platform;
  status?: string;
};

export function ActionButton({ accountId, platform, status }: ActionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);

    async function connect() {
    setBusy(true);
    try {
        const res = await fetch(apiUrl("/api/accounts/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform })
      });

      const data = await res.json();
      router.refresh();

      if (data?.account?.status === "NEEDS_LOGIN") {
        setShowConnectModal(true);
        setConnectMessage(data?.message ?? "Open Amazon in the new tab and sign in. We will keep checking for a saved session.");

        const platformLoginUrls: Record<Platform, string> = {
          AMAZON: "https://www.amazon.in/ap/signin",
          FLIPKART: "https://www.flipkart.com/account/login",
          ZEPTO: "https://www.zeptonow.com/login"
        };

        const url = platformLoginUrls[platform] ?? platformLoginUrls.AMAZON;
        window.open(url, "_blank", "noopener,noreferrer");
        setPolling(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!accountId) return;
    setBusy(true);
    try {
      await fetch(apiUrl(`/api/accounts/${accountId}/sync`), { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isConnected = Boolean(accountId);
  const canSync = isConnected && status === "CONNECTED";

  useEffect(() => {
    if (!polling) {
      return;
    }

    let cancelled = false;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(apiUrl("/api/accounts/connect"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform })
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        setPollAttempt((value) => value + 1);

        if (cancelled) return;

        if (payload?.account?.status === "CONNECTED") {
          setConnectMessage("Amazon is connected. You can sync orders now.");
          setPolling(false);
          setShowConnectModal(false);
          router.refresh();
        } else if (payload?.account?.status === "NEEDS_LOGIN") {
          setConnectMessage(payload?.message ?? "Please finish Amazon sign-in in the opened tab, then we will check again.");
        }
      } catch {
        // Keep polling until the user finishes sign-in or closes the modal.
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [platform, polling, router]);

  function stopPolling() {
    setPolling(false);
    setShowConnectModal(false);
    setConnectMessage(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={canSync ? sync : connect}
        disabled={busy}
        className={clsx(
          "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
          canSync
            ? "border-ink bg-ink text-ledger hover:bg-coral"
            : "border-line bg-receipt text-ink hover:border-ink",
          busy && "cursor-wait opacity-60"
        )}
      >
        {canSync ? <RefreshCw size={15} /> : <Cable size={15} />}
        {busy ? "Working" : canSync ? "Sync orders" : status === "NEEDS_LOGIN" ? "Check session" : "Connect"}
      </button>

      {showConnectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border-2 border-ink bg-receipt p-5 shadow-[12px_12px_0_#151716]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-coral">Connect Amazon</p>
                <h3 className="mt-2 text-2xl font-black">Sign in, then we&apos;ll save the session</h3>
              </div>
              <button
                type="button"
                onClick={stopPolling}
                className="rounded-full border border-line p-2 transition hover:border-ink hover:bg-ledger"
                aria-label="Close connect dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-ledger p-4">
              <p className="text-sm leading-6 text-ink/90">
                A new Amazon tab was opened. Sign in there, finish any verification, and come back here. We will keep
                checking whether Anakin has a saved session for this account.
              </p>
              {connectMessage ? <p className="mt-3 text-sm font-medium text-coral">{connectMessage}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <a
                href="https://www.amazon.in/ap/signin"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 font-semibold text-ledger transition hover:bg-coral"
              >
                Open Amazon again <ExternalLink size={14} />
              </a>
              <button
                type="button"
                onClick={() => setPollAttempt((value) => value + 1)}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-receipt px-4 py-2 font-semibold transition hover:border-ink"
              >
                {polling ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {polling ? `Checking... ${pollAttempt}` : "Check again"}
              </button>
              <button
                type="button"
                onClick={stopPolling}
                className="inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-2 text-ink/70 transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
