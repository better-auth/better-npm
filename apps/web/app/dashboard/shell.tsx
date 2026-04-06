"use client";

import { signOut } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ExitIcon,
  SunIcon,
  MoonIcon,
  GearIcon,
} from "@radix-ui/react-icons";

interface User {
  name: string | null;
  email: string;
  image: string | null;
}

export function DashboardShell({
  user,
  isAdmin,
  children,
}: {
  user: User;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh flex flex-col">
      <nav className="h-14 flex-shrink-0 flex items-center justify-between px-4 sm:px-8 border-b border-foreground/[0.06]">
        <Link href="/dashboard" className="text-sm tracking-tight">
          better-npm.
        </Link>
        <AccountMenu user={user} isAdmin={isAdmin} />
      </nav>
      <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto h-full">{children}</div>
      </div>
    </div>
  );
}

function AccountMenu({ user, isAdmin }: { user: User; isAdmin?: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2.5 outline-none cursor-pointer hover:opacity-80 transition-opacity">
          {user.image ? (
            <img src={user.image} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-foreground/[0.08] flex items-center justify-center text-[11px] text-foreground/40">
              {(user.name?.[0] || "U").toUpperCase()}
            </div>
          )}
          <div className="hidden sm:block text-left">
            <p className="text-[13px] text-foreground/60">{user.name || "User"}</p>
            <p className="text-[11px] text-foreground/30">{user.email}</p>
          </div>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="min-w-[200px] border border-foreground/[0.08] bg-background rounded-md overflow-hidden z-50 p-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 duration-100"
        >
          <div className="px-2.5 py-2">
            <p className="text-[13px] truncate">{user.name || "User"}</p>
            <p className="text-[11px] text-foreground/30 truncate">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="h-px bg-foreground/[0.06] mx-1 my-1" />
          {isAdmin && (
            <>
              <DropdownMenu.Item asChild>
                <Link
                  href="/dashboard/admin"
                  className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground/50 rounded-sm cursor-pointer outline-none data-[highlighted]:bg-foreground/[0.06] data-[highlighted]:text-foreground transition-colors"
                >
                  <GearIcon width={14} height={14} />
                  Admin Dashboard
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-foreground/[0.06] mx-1 my-1" />
            </>
          )}
          <ThemeToggleItem />
          <DropdownMenu.Separator className="h-px bg-foreground/[0.06] mx-1 my-1" />
          <DropdownMenu.Item
            onSelect={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => { window.location.href = "/"; },
                },
              })
            }
            className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground/50 rounded-sm cursor-pointer outline-none data-[highlighted]:bg-foreground/[0.06] data-[highlighted]:text-foreground transition-colors"
          >
            <ExitIcon width={14} height={14} />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThemeToggleItem() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    if (stored) {
      setTheme(stored);
    } else {
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    }
  }, []);

  if (!theme) return null;

  return (
    <DropdownMenu.Item
      onSelect={(e) => {
        e.preventDefault();
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(next);
        localStorage.setItem("theme", next);
      }}
      className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground/50 rounded-sm cursor-pointer outline-none data-[highlighted]:bg-foreground/[0.06] data-[highlighted]:text-foreground transition-colors"
    >
      {theme === "dark" ? (
        <SunIcon width={14} height={14} />
      ) : (
        <MoonIcon width={14} height={14} />
      )}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </DropdownMenu.Item>
  );
}
