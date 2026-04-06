import { requireAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "./nav";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdmin();
  if (!session) redirect("/dashboard");

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 -mt-6 sm:-mt-8 -mx-4 sm:-mx-8 px-4 sm:px-8 pb-0">
        <div className="pt-6 sm:pt-8 pb-6">
          <h1 className="text-lg font-medium">Admin</h1>
          <p className="text-sm text-foreground/40 mt-0.5">
            Registry & user management
          </p>
        </div>
        <AdminNav />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar mt-6">{children}</div>
    </div>
  );
}
