"use client";

import { signIn, useSession } from "@/lib/auth-client";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { useEffect } from "react";

export default function SignInPage() {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (session) {
      window.location.href = "/dashboard";
    }
  }, [session]);

  if (isPending) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-sm text-foreground/40">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <a href="/" className="text-sm tracking-tight mb-10 block">
          better-npm.
        </a>

        <h1 className="text-xl font-medium">Sign in</h1>
        <p className="mt-3 text-sm text-foreground/50">
          Manage your registry, blocked packages, and subscription.
        </p>

        <button
          onClick={() => signIn.social({ provider: "github", callbackURL: "/dashboard" })}
          className="mt-8 w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <GitHubLogoIcon width={16} height={16} />
          Continue with GitHub
        </button>

        <p className="mt-6 text-[11px] text-foreground/25 text-center">
          By continuing, you agree to the terms of service.
        </p>
      </div>
    </div>
  );
}
