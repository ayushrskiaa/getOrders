"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldAlert, ArrowRight } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(false);

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Login failed.");
      }

      setToken(data.token);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-md border border-ink bg-mint px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide mb-3">
            OrderHub Auth
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink">Welcome Back</h1>
          <p className="mt-2 text-sm text-ink/75">
            Log in to manage and sync your orders in one ledger.
          </p>
        </header>

        <div className="bg-receipt border-2 border-ink rounded-2xl p-8 shadow-[8px_8px_0_#151716] transition-all duration-300">
          <div className="h-2 w-full bg-cobalt rounded-full mb-6"></div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border-2 border-coral bg-coral/10 p-4 text-sm text-ink">
              <ShieldAlert className="text-coral shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold">Authentication error</p>
                <p className="text-xs text-ink/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block font-mono text-xs uppercase tracking-wide text-ink/70 mb-2 font-bold">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="block w-full pl-10 pr-3 py-3 border-2 border-ink rounded-lg bg-ledger/30 text-ink placeholder-ink/45 font-semibold text-sm outline-none transition focus:border-cobalt focus:bg-receipt focus:shadow-[4px_4px_0_#151716]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wide text-ink/70 mb-2 font-bold">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40">
                  <KeyRound size={16} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-3 border-2 border-ink rounded-lg bg-ledger/30 text-ink placeholder-ink/45 font-semibold text-sm outline-none transition focus:border-cobalt focus:bg-receipt focus:shadow-[4px_4px_0_#151716]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-cobalt px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0_#151716] transition hover:bg-coral active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#151716] disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Log in to OrderHub"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-line text-center text-xs">
            <span className="text-ink/60">New to OrderHub? </span>
            <Link
              href="/signup"
              className="font-bold text-cobalt hover:underline hover:text-coral transition-colors"
            >
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
