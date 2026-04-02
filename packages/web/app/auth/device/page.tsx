"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "@/lib/auth-client";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

type Step = "confirm" | "signing-in" | "completing" | "done" | "error";

export default function DeviceAuthPage() {
  const { data: session, isPending } = useSession();
  const [userCode, setUserCode] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("confirm");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUserCode(params.get("code"));
  }, []);

  useEffect(() => {
    if (session && userCode && step === "signing-in") {
      completeDevice();
    }
  }, [session, userCode, step]);

  async function completeDevice() {
    if (!session || !userCode) return;
    setStep("completing");

    try {
      const res = await fetch("/api/device/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: userCode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || "Failed to complete setup");
      }

      setStep("done");
    } catch (e: any) {
      setError(e.message);
      setStep("error");
    }
  }

  function handleGitHubLogin() {
    setStep("signing-in");
    signIn.social({
      provider: "github",
      callbackURL: `/auth/device?code=${userCode}`,
    });
  }

  if (!userCode) {
    return (
      <Shell>
        <h1 className="text-xl font-medium">Invalid link</h1>
        <p className="mt-3 text-sm text-foreground/50">
          Run <code className="font-mono text-foreground/60">npx better-npm</code> in
          your terminal to get a valid device code.
        </p>
      </Shell>
    );
  }

  if (isPending) {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Loading...</div>
      </Shell>
    );
  }

  if (step === "done") {
    return (
      <Shell>
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-xl font-medium">You&apos;re all set</h1>
        <p className="mt-3 text-sm text-foreground/50">
          Go back to your terminal. You can close this tab.
        </p>
      </Shell>
    );
  }

  if (step === "error") {
    return (
      <Shell>
        <h1 className="text-xl font-medium text-red-400">Something went wrong</h1>
        <p className="mt-3 text-sm text-foreground/50">{error}</p>
        <p className="mt-4 text-sm text-foreground/40">
          Run <code className="font-mono text-foreground/60">npx better-npm</code> to
          try again.
        </p>
      </Shell>
    );
  }

  if (step === "completing") {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Setting up your account...</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <span className="font-mono text-sm tracking-tight mb-8 block">
        <span className="text-foreground/80">better</span>
        <span className="text-foreground/50">-npm</span>
      </span>

      <h1 className="text-xl font-medium">Sign in to better-npm</h1>
      <p className="mt-3 text-sm text-foreground/50">
        Your terminal is requesting access. Confirm the code below matches
        what you see in your terminal.
      </p>

      <div className="mt-8 px-6 py-4 border border-foreground/[0.08] rounded-lg bg-foreground/[0.02] text-center">
        <div className="text-xs text-foreground/30 uppercase tracking-wider mb-2 font-mono">
          Device code
        </div>
        <div className="font-mono text-2xl tracking-[0.2em] font-medium text-foreground/90">
          {userCode}
        </div>
      </div>

      <button
        onClick={handleGitHubLogin}
        className="mt-8 w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
      >
        <GitHubLogoIcon width={16} height={16} />
        Continue with GitHub
      </button>

      <p className="mt-6 text-[11px] text-foreground/25 text-center">
        By continuing, you agree to the terms of service.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-sm w-full">{children}</div>
    </div>
  );
}
