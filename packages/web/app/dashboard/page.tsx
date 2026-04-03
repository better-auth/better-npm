"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons";

type BlockRow = {
  id: string;
  package_name: string;
  version: string;
  created_at: number;
};

type CuratedPackage = {
  package_name: string;
  last_seen_at: number;
  metadata_requests: number;
  tarball_downloads: number;
  tracked: boolean;
  latest_review: {
    version: string;
    version_status: string;
    risk_score: number | null;
    summary: string | null;
    review_created_at: number;
  } | null;
};

type UsageRow = {
  id: string;
  package_name: string;
  version: string | null;
  kind: string;
  created_at: number;
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const [blocks, setBlocks] = useState<BlockRow[] | null>(null);
  const [packages, setPackages] = useState<CuratedPackage[] | null>(null);
  const [activity, setActivity] = useState<UsageRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [bRes, pRes, aRes] = await Promise.all([
        fetch("/api/dashboard/blocks", { credentials: "include" }),
        fetch("/api/dashboard/packages?limit=40", { credentials: "include" }),
        fetch("/api/dashboard/activity?limit=30", { credentials: "include" }),
      ]);
      const bJson = await bRes.json().catch(() => ({}));
      const pJson = await pRes.json().catch(() => ({}));
      const aJson = await aRes.json().catch(() => ({}));

      let err: string | null = null;
      if (!bRes.ok) {
        err =
          (bJson as { error?: string }).error || `blocks: ${bRes.status}`;
      } else if (!pRes.ok) {
        err =
          (pJson as { error?: string }).error ||
          `packages: ${pRes.status}`;
      } else if (!aRes.ok) {
        err =
          (aJson as { error?: string }).error ||
          `activity: ${aRes.status}`;
      }
      setLoadError(err);
      setBlocks(
        bRes.ok ? ((bJson as { blocks?: BlockRow[] }).blocks ?? []) : [],
      );
      setPackages(
        pRes.ok ? ((pJson as { packages?: CuratedPackage[] }).packages ?? []) : [],
      );
      setActivity(
        aRes.ok ? ((aJson as { activity?: UsageRow[] }).activity ?? []) : [],
      );
    } catch {
      setLoadError("Failed to load dashboard data");
      setBlocks([]);
      setPackages([]);
      setActivity([]);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      window.location.href = "/auth/sign-in";
    }
  }, [isPending, session]);

  useEffect(() => {
    if (!isPending && session) {
      void refresh();
    }
  }, [isPending, session, refresh]);

  if (isPending) {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Loading...</div>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <div className="text-sm text-foreground/40">Redirecting...</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-4xl mx-auto w-full">
        <Header session={session} />
        {loadError ? (
          <p className="mt-6 text-sm text-red-400/90 font-mono">{loadError}</p>
        ) : null}
        <div className="mt-10 space-y-14">
          <CuratedSection
            rows={packages}
            onBlocked={refresh}
            blockedKeys={
              new Set(
                (blocks ?? []).map((b) => `${b.package_name}\0${b.version}`),
              )
            }
          />
          <BlockedPackagesSection
            blocks={blocks}
            onChanged={refresh}
          />
          <ActivitySection rows={activity} />
        </div>
      </div>
    </Shell>
  );
}

function Header({ session }: { session: { user: { name?: string | null; email?: string | null } } }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-medium">
          {session.user.name || session.user.email}
        </h1>
        <p className="text-sm text-foreground/40 mt-0.5">{session.user.email}</p>
      </div>
      <button
        type="button"
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

async function postBlock(packageName: string, version: string) {
  const res = await fetch("/api/dashboard/blocks", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      package_name: packageName,
      version: version.trim() || "*",
    }),
  });
  return res.ok;
}

async function deleteBlock(packageName: string, version: string) {
  const qs = new URLSearchParams({
    package_name: packageName,
    version,
  });
  const res = await fetch(`/api/dashboard/blocks?${qs}`, {
    method: "DELETE",
    credentials: "include",
  });
  return res.ok;
}

function CuratedSection({
  rows,
  onBlocked,
  blockedKeys,
}: {
  rows: CuratedPackage[] | null;
  onBlocked: () => void;
  blockedKeys: Set<string>;
}) {
  if (rows === null) {
    return (
      <SectionTitle title="Packages you use">
        <p className="text-sm text-foreground/30 font-mono">Loading…</p>
      </SectionTitle>
    );
  }

  if (rows.length === 0) {
    return (
      <SectionTitle title="Packages you use">
        <p className="text-sm text-foreground/40">
          No registry activity recorded yet. Install packages with your CLI
          token to see them here.
        </p>
      </SectionTitle>
    );
  }

  return (
    <SectionTitle title="Packages you use">
      <p className="text-sm text-foreground/40 mb-4">
        From your authenticated registry requests. Tracked packages show review
        status when available.
      </p>
      <div className="border border-foreground/[0.08] rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/[0.06] text-left text-[11px] font-mono uppercase tracking-wider text-foreground/35">
              <th className="px-3 py-2 font-medium">Package</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
              <th className="px-3 py-2 font-medium">Usage</th>
              <th className="px-3 py-2 font-medium">Review</th>
              <th className="px-3 py-2 font-medium w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const allKey = `${row.package_name}\0*`;
              const allBlocked = blockedKeys.has(allKey);
              const rev = row.latest_review;
              const verKey =
                rev?.version != null
                  ? `${row.package_name}\0${rev.version}`
                  : null;
              const verBlocked = verKey ? blockedKeys.has(verKey) : false;
              return (
                <tr
                  key={row.package_name}
                  className="border-t border-foreground/[0.06]"
                >
                  <td className="px-3 py-2.5 align-top">
                    <code className="font-mono text-foreground/80">
                      {row.package_name}
                    </code>
                    {row.tracked ? (
                      <span className="ml-2 text-[10px] font-mono uppercase text-foreground/25">
                        tracked
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-top text-foreground/45 text-xs whitespace-nowrap">
                    {formatTime(row.last_seen_at)}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-foreground/40 font-mono">
                    meta {row.metadata_requests} · tb{" "}
                    {row.tarball_downloads}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-foreground/45 max-w-[200px]">
                    {rev ? (
                      <>
                        <span className="font-mono text-foreground/55">
                          {rev.version}
                        </span>{" "}
                        <span className="text-foreground/30">
                          {rev.version_status}
                        </span>
                        {rev.risk_score != null ? (
                          <span className="block mt-0.5 text-foreground/35">
                            risk {rev.risk_score}
                          </span>
                        ) : null}
                        {rev.summary ? (
                          <span className="block mt-1 text-foreground/30 line-clamp-2">
                            {rev.summary}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-foreground/25">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={allBlocked}
                        onClick={async () => {
                          if (await postBlock(row.package_name, "*")) {
                            onBlocked();
                          }
                        }}
                        className="text-[11px] font-mono px-2 py-1 rounded border border-foreground/15 text-foreground/50 hover:text-foreground/80 hover:border-foreground/25 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {allBlocked ? "All blocked" : "Block all"}
                      </button>
                      {rev?.version ? (
                        <button
                          type="button"
                          disabled={verBlocked}
                          onClick={async () => {
                            if (
                              await postBlock(row.package_name, rev.version)
                            ) {
                              onBlocked();
                            }
                          }}
                          className="text-[11px] font-mono px-2 py-1 rounded border border-foreground/15 text-foreground/50 hover:text-foreground/80 hover:border-foreground/25 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {verBlocked
                            ? `v${rev.version} blocked`
                            : `Block v${rev.version}`}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionTitle>
  );
}

function BlockedPackagesSection({
  blocks,
  onChanged,
}: {
  blocks: BlockRow[] | null;
  onChanged: () => void;
}) {
  const [input, setInput] = useState("");
  const [version, setVersion] = useState("");

  async function addPackage() {
    const name = input.trim();
    if (!name) return;
    if (await postBlock(name, version.trim() || "*")) {
      setInput("");
      setVersion("");
      onChanged();
    }
  }

  if (blocks === null) {
    return (
      <SectionTitle title="Blocked packages">
        <p className="text-sm text-foreground/30 font-mono">Loading…</p>
      </SectionTitle>
    );
  }

  return (
    <SectionTitle title="Blocked packages">
      <p className="text-sm text-foreground/40 mb-6">
        These installs are denied for your account (all CLI tokens). Leave
        version empty to block the entire package.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPackage()}
          placeholder="package name"
          className="flex-1 min-w-[160px] bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg px-3 py-2 text-sm font-mono placeholder:text-foreground/20 focus:outline-none focus:border-foreground/20 transition-colors"
        />
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPackage()}
          placeholder="version (all)"
          className="w-36 bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg px-3 py-2 text-sm font-mono placeholder:text-foreground/20 focus:outline-none focus:border-foreground/20 transition-colors"
        />
        <button
          type="button"
          onClick={addPackage}
          className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <PlusIcon width={14} height={14} />
          Block
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="border border-dashed border-foreground/[0.08] rounded-lg py-10 text-center">
          <p className="text-sm text-foreground/25">No blocked packages</p>
        </div>
      ) : (
        <div className="border border-foreground/[0.08] rounded-lg overflow-hidden">
          {blocks.map((pkg, i) => (
            <div
              key={pkg.id}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-foreground/[0.06]" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <code className="font-mono text-sm text-foreground/70 truncate">
                  {pkg.package_name}
                </code>
                <span className="font-mono text-xs text-foreground/25 shrink-0">
                  {pkg.version === "*" ? "all versions" : pkg.version}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (await deleteBlock(pkg.package_name, pkg.version)) {
                    onChanged();
                  }
                }}
                className="text-foreground/20 hover:text-foreground/50 transition-colors cursor-pointer shrink-0"
                aria-label="Remove block"
              >
                <Cross2Icon width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionTitle>
  );
}

function ActivitySection({ rows }: { rows: UsageRow[] | null }) {
  if (rows === null) {
    return (
      <SectionTitle title="Recent activity">
        <p className="text-sm text-foreground/30 font-mono">Loading…</p>
      </SectionTitle>
    );
  }

  if (rows.length === 0) {
    return (
      <SectionTitle title="Recent activity">
        <p className="text-sm text-foreground/25">No events yet</p>
      </SectionTitle>
    );
  }

  return (
    <SectionTitle title="Recent activity">
      <div className="border border-foreground/[0.08] rounded-lg divide-y divide-foreground/[0.06]">
        {rows.map((ev) => (
          <div
            key={ev.id}
            className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
          >
            <span className="font-mono text-foreground/60">{ev.kind}</span>
            <code className="font-mono text-foreground/75">{ev.package_name}</code>
            {ev.version ? (
              <span className="font-mono text-xs text-foreground/35">
                @{ev.version}
              </span>
            ) : null}
            <span className="text-xs text-foreground/25 ml-auto">
              {formatTime(ev.created_at)}
            </span>
          </div>
        ))}
      </div>
    </SectionTitle>
  );
}

function SectionTitle({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h2 className="font-mono text-[11px] tracking-wider uppercase text-foreground/40">
          {title}
        </h2>
        <span className="h-px flex-1 bg-foreground/[0.06]" />
      </div>
      {children}
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
      <div className="px-8 lg:px-12 py-12">{children}</div>
    </div>
  );
}
