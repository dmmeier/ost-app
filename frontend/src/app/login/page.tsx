"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Wordmark } from "@/components/brand/Wordmark";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, hydrate, isAuthenticated, authRequired } = useAuthStore();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Hydrate auth state on mount
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Redirect if already authenticated or auth not required
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
      return;
    }
    if (authRequired === false) {
      router.push("/");
    }
  }, [isAuthenticated, authRequired, router]);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.auth.login(email, password);
      setAuth(result.user, result.token);
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await api.auth.register(email, displayName, password);
      setAuth(result.user, result.token);
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--ost-canvas)' }}>
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Wordmark height={32} className="mx-auto" />
        </div>

        {/* Card */}
        <div className="rounded-lg shadow-sm p-6" style={{ background: 'var(--ost-paper)', border: '1px solid var(--ost-line)' }}>
          {/* Tab toggle */}
          <div className="flex mb-6 border-b border-line">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                mode === "login"
                  ? "text-[#0d9488] border-b-2 border-[#0d9488]"
                  : "text-ost-muted hover:text-ink"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                mode === "register"
                  ? "text-[#0d9488] border-b-2 border-[#0d9488]"
                  : "text-ost-muted hover:text-ink"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                placeholder={mode === "register" ? "Min 8 characters" : "Your password"}
                required
                minLength={mode === "register" ? 8 : undefined}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  placeholder="Confirm password"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0d9488] text-white rounded-md text-sm font-medium hover:bg-[#0b7f74] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
