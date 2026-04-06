"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/block-rules", label: "Block List" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-foreground/[0.06]">
      {tabs.map((tab, i) => {
        const active =
          tab.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${i === 0 ? "pl-0 pr-3" : "px-3"} py-2 text-[13px] border-b-2 transition-colors ${
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
