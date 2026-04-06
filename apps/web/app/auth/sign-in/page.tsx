import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "./form";

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <a href="/" className="text-sm tracking-tight mb-10 block">
          better-npm.
        </a>

        <h1 className="text-xl font-medium">Sign in</h1>
        <p className="mt-3 text-sm text-foreground/50">
          Manage your registry settings and dashboard.
        </p>

        <SignInForm />

        <p className="mt-6 text-[11px] text-foreground/25 text-center">
          By continuing, you agree to the terms of service.
        </p>
      </div>
    </div>
  );
}
