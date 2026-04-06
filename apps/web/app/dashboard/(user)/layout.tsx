import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { DashboardNav } from "./nav";

export default async function UserDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const firstName = session?.user.name?.split(" ")[0] || "there";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-medium">Welcome back, {firstName}</h1>
          <p className="text-sm text-foreground/40 mt-0.5">
            Your account and install activity
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">
        <DashboardNav />
      </div>
      <div className="mt-6 flex-1 min-h-0 overflow-y-auto thin-scrollbar">{children}</div>
    </div>
  );
}
