"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons";

export default function Dashboard() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Loading...</div>
      </Shell>
    );
  }

  useEffect(() => {
    if (!isPending && !session) {
      window.location.href = "/auth/sign-in";
    }
  }, [isPending, session]);

  if (!session) {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Redirecting...</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto w-full">
        <Header session={session} />
        <div className="mt-10 space-y-10">
          <BlockedPackages />
        </div>
      </div>
    </Shell>
  );
}

function Header({ session }: { session: any }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-medium">{session.user.name || session.user.email}</h1>
        <p className="text-sm text-foreground/40 mt-0.5">{session.user.email}</p>
      </div>
      <button
        onClick={() =>
          signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.href = "/";
              },
            },
          })
        }
        className="text-xs text-foreground/30 hover:text-foreground/60 transition-colors font-mono cursor-pointer"
      >
        Sign out
      </button>
    </div>
  );
}

function BlockedPackages() {
  const [packages, setPackages] = useState<{ name: string; version: string }[]>([]);
  const [input, setInput] = useState("");
  const [version, setVersion] = useState("");

  function addPackage() {
    const name = input.trim();
    if (!name) return;
    if (packages.some((p) => p.name === name && p.version === (version.trim() || "*"))) return;
    setPackages([...packages, { name, version: version.trim() || "*" }]);
    setInput("");
    setVersion("");
  }

  function removePackage(index: number) {
    setPackages(packages.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-mono text-[11px] tracking-wider uppercase text-foreground/40">
          Blocked packages
        </h2>
        <span className="h-px flex-1 bg-foreground/[0.06]" />
      </div>

      <p className="text-sm text-foreground/40 mb-6">
        Packages on this list will be blocked from installing. You can block all
        versions or specific ones.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPackage()}
          placeholder="package name"
          className="flex-1 bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg px-3 py-2 text-sm font-mono placeholder:text-foreground/20 focus:outline-none focus:border-foreground/20 transition-colors"
        />
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPackage()}
          placeholder="version (all)"
          className="w-32 bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg px-3 py-2 text-sm font-mono placeholder:text-foreground/20 focus:outline-none focus:border-foreground/20 transition-colors"
        />
        <button
          onClick={addPackage}
          className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <PlusIcon width={14} height={14} />
          Block
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="border border-dashed border-foreground/[0.08] rounded-lg py-10 text-center">
          <p className="text-sm text-foreground/25">No blocked packages yet</p>
          <p className="text-xs text-foreground/15 mt-1">
            Add a package name above to block it from installing
          </p>
        </div>
      ) : (
        <div className="border border-foreground/[0.08] rounded-lg overflow-hidden">
          {packages.map((pkg, i) => (
            <div
              key={`${pkg.name}-${pkg.version}-${i}`}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-foreground/[0.06]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <code className="font-mono text-sm text-foreground/70">{pkg.name}</code>
                <span className="font-mono text-xs text-foreground/25">
                  {pkg.version === "*" ? "all versions" : pkg.version}
                </span>
              </div>
              <button
                onClick={() => removePackage(i)}
                className="text-foreground/20 hover:text-foreground/50 transition-colors cursor-pointer"
              >
                <Cross2Icon width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <nav className="flex items-center justify-between px-8 lg:px-12 h-14 border-b border-foreground/[0.06]">
        <a href="/" className="text-sm tracking-tight">
          better-npm.
        </a>
      </nav>
      <div className="px-8 lg:px-12 py-12">
        {children}
      </div>
    </div>
  );
}
