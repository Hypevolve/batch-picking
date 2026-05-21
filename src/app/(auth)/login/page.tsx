"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/pick";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Neispravni podaci za prijavu.");
      setLoading(false);
    } else {
      const res = await fetch("/api/auth/session");
      const session = await res.json();
      const role = session?.user?.role;

      if (callbackUrl && callbackUrl !== "/pick" && callbackUrl !== "/") {
        router.push(callbackUrl);
      } else if (role === "admin") {
        router.push("/dashboard");
      } else {
        router.push("/pick");
      }
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branded panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-[420px] bg-ds-text-primary flex-col justify-between p-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-ds-12">LP</span>
          </div>
          <span className="text-ds-14 font-semibold text-white tracking-tight">Libar Picking</span>
        </div>

        <div>
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h2 className="text-ds-22 font-semibold text-white leading-snug tracking-tight">
            Sustav za upravljanje<br />komisioniranjem
          </h2>
          <p className="text-ds-13 text-ds-sidebar-muted mt-3 leading-relaxed">
            Pratite narudžbe, dodjeljujte batcheve i optimizirajte put kroz skladište u stvarnom vremenu.
          </p>
        </div>

        <p className="text-ds-11 text-ds-sidebar-faint">
          © {new Date().getFullYear()} Libar d.o.o.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-ds-bg px-6 py-12">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-ds-11">LP</span>
            </div>
            <span className="text-ds-14 font-semibold text-ds-text-primary tracking-tight">Libar Picking</span>
          </div>

          <div className="mb-8">
            <h1 className="text-ds-22 font-semibold text-ds-text-primary tracking-tight">Prijavite se</h1>
            <p className="text-ds-13 text-ds-text-secondary mt-1">Unesite podatke za pristup sustavu.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded text-ds-13">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-ds-13 font-medium text-ds-text-primary mb-1.5">
                Email
              </label>
              <input
                id="email"
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-ds-border rounded bg-white text-ds-14 text-ds-text-primary placeholder:text-ds-text-muted focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                placeholder="ime@libar.hr"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-ds-13 font-medium text-ds-text-primary mb-1.5">
                Lozinka
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-ds-border rounded bg-white text-ds-14 text-ds-text-primary placeholder:text-ds-text-muted focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white text-ds-14 font-medium rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? "Prijava..." : "Prijavite se"}
            </button>
          </form>

          <p className="text-center text-ds-11 text-ds-text-muted mt-10 lg:hidden">
            © {new Date().getFullYear()} Libar d.o.o.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-ds-bg">
        <p className="text-ds-13 text-ds-text-muted">Učitavanje...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
