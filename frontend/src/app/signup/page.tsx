"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, User, ShieldAlert, ArrowRight } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Signup failed.");
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
          <h1 className="text-4xl font-black tracking-tight text-ink">Get Started</h1>
          <p className="mt-2 text-sm text-ink/75">
            Create an account to track order details and analytics.
          </p>
        </header>

        <div className="bg-receipt border-2 border-ink rounded-2xl p-8 shadow-[8px_8px_0_#151716] transition-all duration-300">
          <div className="h-2 w-full bg-coral rounded-full mb-6"></div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border-2 border-coral bg-coral/10 p-4 text-sm text-ink">
              <ShieldAlert className="text-coral shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold">Registration error</p>
                <p className="text-xs text-ink/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block font-mono text-xs uppercase tracking-wide text-ink/70 mb-2 font-bold">
                Your Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ayush Kumar"
                  className="block w-full pl-10 pr-3 py-3 border-2 border-ink rounded-lg bg-ledger/30 text-ink placeholder-ink/45 font-semibold text-sm outline-none transition focus:border-cobalt focus:bg-receipt focus:shadow-[4px_4px_0_#151716]"
                  required
                />
              </div>
            </div>

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
                  placeholder="Min. 6 characters"
                  className="block w-full pl-10 pr-3 py-3 border-2 border-ink rounded-lg bg-ledger/30 text-ink placeholder-ink/45 font-semibold text-sm outline-none transition focus:border-cobalt focus:bg-receipt focus:shadow-[4px_4px_0_#151716]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wide text-ink/70 mb-2 font-bold">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40">
                  <KeyRound size={16} />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-3 border-2 border-ink rounded-lg bg-ledger/30 text-ink placeholder-ink/45 font-semibold text-sm outline-none transition focus:border-cobalt focus:bg-receipt focus:shadow-[4px_4px_0_#151716]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-mint px-4 py-3 text-sm font-black text-ink shadow-[4px_4px_0_#151716] transition hover:bg-coral hover:text-white active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#151716] disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create Free Account"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-line text-center text-xs">
            <span className="text-ink/60">Already have an account? </span>
            <Link
              href="/login"
              className="font-bold text-cobalt hover:underline hover:text-coral transition-colors"
            >
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
