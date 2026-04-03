"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn, useSession } from "@/lib/auth-client";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

type Step =
  | "loading"
  | "invalid"
  | "verify_error"
  | "ready"
  | "approving"
  | "done"
  | "error";

function formatUserCodeForDisplay(code: string): string {
  const c = code.replace(/-/g, "").toUpperCase();
  if (c.length <= 4) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

export default function DeviceAuthPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const [step, setStep] = useState<Step>("loading");
  const [userCodeParam, setUserCodeParam] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const approveStarted = useRef(false);

  const verifyCode = useCallback(async (rawFromQuery: string) => {
    const formatted = rawFromQuery.trim().replace(/-/g, "").toUpperCase();
    if (!formatted) {
      setStep("invalid");
      return;
    }

    setUserCodeParam(rawFromQuery.trim());
    setDisplayCode(formatUserCodeForDisplay(formatted));

    const res = await fetch(
      `/api/auth/device?user_code=${encodeURIComponent(formatted)}`,
      { credentials: "include" },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        (data as { error_description?: string }).error_description ||
          "Invalid or expired code",
      );
      setStep("verify_error");
      return;
    }

    const data = (await res.json()) as { status: string };
    if (data.status !== "pending") {
      setError("This code was already used or is no longer pending.");
      setStep("verify_error");
      return;
    }

    setStep("ready");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("user_code") || params.get("code");
    if (!code) {
      setStep("invalid");
      return;
    }
    verifyCode(code).catch(() => {
      setError("Could not verify code");
      setStep("verify_error");
    });
  }, [verifyCode]);

  async function approveDevice() {
    if (!userCodeParam) return;
    setStep("approving");
    setError(null);
    try {
      const res = await fetch("/api/auth/device/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userCode: userCodeParam.replace(/-/g, "").toUpperCase(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error_description?: string }).error_description ||
            "Failed to approve",
        );
      }
      setStep("done");
    } catch (e: unknown) {
      approveStarted.current = false;
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStep("error");
    }
  }

  useEffect(() => {
    if (
      step !== "ready" ||
      !session ||
      sessionPending ||
      !userCodeParam ||
      approveStarted.current
    ) {
      return;
    }
    approveStarted.current = true;
    void approveDevice();
  }, [step, session, sessionPending, userCodeParam]);

  function handleGitHubLogin() {
    const q = userCodeParam
      ? `?user_code=${encodeURIComponent(userCodeParam.replace(/-/g, "").toUpperCase())}`
      : "";
    signIn.social({
      provider: "github",
      callbackURL: `/auth/device${q}`,
    });
  }

  if (step === "invalid") {
    return (
      <Shell>
        <h1 className="text-xl font-medium">Invalid link</h1>
        <p className="mt-3 text-sm text-foreground/50">
          Run <code className="font-mono text-foreground/60">npx better-npm</code>{" "}
          in your terminal to get a valid device link.
        </p>
      </Shell>
    );
  }

  if (step === "loading" || sessionPending) {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Loading...</div>
      </Shell>
    );
  }

  if (step === "verify_error") {
    return (
      <Shell>
        <h1 className="text-xl font-medium text-red-400">Invalid code</h1>
        <p className="mt-3 text-sm text-foreground/50">{error}</p>
        <p className="mt-4 text-sm text-foreground/40">
          Run <code className="font-mono text-foreground/60">npx better-npm</code>{" "}
          to try again.
        </p>
      </Shell>
    );
  }

  if (step === "done") {
    return (
      <Shell>
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-400"
            role="img"
          >
            <title>Success</title>
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
          Run <code className="font-mono text-foreground/60">npx better-npm</code>{" "}
          to try again.
        </p>
      </Shell>
    );
  }

  if (step === "approving") {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Approving terminal access...</div>
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
        Your terminal is requesting access. Confirm the code below matches what
        you see in your terminal.
      </p>

      <div className="mt-8 px-6 py-4 border border-foreground/[0.08] rounded-lg bg-foreground/[0.02] text-center">
        <div className="text-xs text-foreground/30 uppercase tracking-wider mb-2 font-mono">
          Device code
        </div>
        <div className="font-mono text-2xl tracking-[0.2em] font-medium text-foreground/90">
          {displayCode}
        </div>
      </div>

      {!session ? (
        <button
          type="button"
          onClick={handleGitHubLogin}
          className="mt-8 w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <GitHubLogoIcon width={16} height={16} />
          Continue with GitHub
        </button>
      ) : null}

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
