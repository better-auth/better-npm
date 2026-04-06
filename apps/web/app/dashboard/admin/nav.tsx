"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard/admin", label: "Overview" },
  { href: "/dashboard/admin/users", label: "Users" },
  { href: "/dashboard/admin/packages", label: "Packages" },
  { href: "/dashboard/admin/reviews", label: "Reviews" },
  { href: "/dashboard/admin/block-rules", label: "Block Rules" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-foreground/[0.06] overflow-x-auto">
      {tabs.map((tab) => {
        const active =
          tab.href === "/dashboard/admin"
            ? pathname === "/dashboard/admin"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2 text-[13px] border-b-2 transition-colors whitespace-nowrap ${
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-foreground/40 hover:text-foreground/60"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
