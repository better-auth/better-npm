"use client";

import { signIn } from "@/lib/auth-client";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

export function SignInForm() {
  return (
    <button
      onClick={() =>
        signIn.social({ provider: "github", callbackURL: "/dashboard" })
      }
      className="mt-8 w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-foreground text-background text-sm font-medium rounded hover:opacity-90 transition-opacity cursor-pointer"
    >
      <GitHubLogoIcon width={16} height={16} />
      Continue with GitHub
    </button>
  );
}
