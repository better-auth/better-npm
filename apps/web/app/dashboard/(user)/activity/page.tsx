import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { registryFetch } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Activity — better-npm",
};

interface InstallRecord {
  id: string;
  package_name: string;
  filename: string;
  cache_hit: number;
  created_at: number;
  version_status: string;
}

interface ActivityResponse {
  activity: InstallRecord[];
  total: number;
  limit: number;
  offset: number;
}

const PER_PAGE_OPTIONS = [25, 50, 100] as const;

function buildHref(params: { page?: number; per?: number }) {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.per && params.per !== 50) qs.set("per", String(params.per));
  const s = qs.toString();
  return `/dashboard/activity${s ? `?${s}` : ""}`;
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (current > 3) pages.push("...");
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; per?: string }>;
}) {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const email = session?.user?.email;
  const params = await searchParams;
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.per) as any)
    ? Number(params.per)
    : 50;
  const page = Math.max(1, Number(params.page || 1));
  const offset = (page - 1) * perPage;

  const data: ActivityResponse = email
    ? await registryFetch(
        `/api/internal/user/activity?email=${encodeURIComponent(email)}&limit=${perPage}&offset=${offset}`,
      ).catch(() => ({ activity: [], total: 0, limit: perPage, offset }))
    : { activity: [], total: 0, limit: perPage, offset };

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));
  const safePage = Math.min(page, totalPages);
  const rangeStart = data.total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + perPage, data.total);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  if (!data.activity.length && safePage === 1) {
    return (
      <div className="rounded border border-dashed border-foreground/[0.08] px-6 py-16 text-center">
        <p className="text-sm text-foreground/30">No install activity yet</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-foreground/20">
          Installs will appear here once packages are downloaded through the
          registry.
        </p>
        <p className="mt-4 text-xs text-foreground/20">
          Run{" "}
          <code className="font-mono text-foreground/30">
            npx @better-npm/cli
          </code>{" "}
          to get started.
        </p>
      </div>
    );
  }

  const paginationNav = (
    <div className="flex items-center gap-1.5">
      <a
        href={
          safePage > 1
            ? buildHref({ page: safePage - 1, per: perPage })
            : undefined
        }
        aria-disabled={safePage <= 1}
        className={`px-2 py-1 rounded text-xs transition-colors ${
          safePage > 1
            ? "text-foreground/50 hover:text-foreground hover:bg-foreground/[0.05]"
            : "text-foreground/15 pointer-events-none"
        }`}
      >
        ← Prev
      </a>
      {pageNumbers.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="text-foreground/20 px-1 text-xs"
          >
            …
          </span>
        ) : (
          <a
            key={p}
            href={buildHref({ page: p, per: perPage })}
            className={`min-w-[28px] text-center px-1.5 py-1 rounded text-xs transition-colors ${
              p === safePage
                ? "bg-foreground/[0.08] text-foreground font-medium"
                : "text-foreground/40 hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
          >
            {p}
          </a>
        ),
      )}
      <a
        href={
          safePage < totalPages
            ? buildHref({ page: safePage + 1, per: perPage })
            : undefined
        }
        aria-disabled={safePage >= totalPages}
        className={`px-2 py-1 rounded text-xs transition-colors ${
          safePage < totalPages
            ? "text-foreground/50 hover:text-foreground hover:bg-foreground/[0.05]"
            : "text-foreground/15 pointer-events-none"
        }`}
      >
        Next →
      </a>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex flex-wrap items-center justify-end gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-foreground/30">
          <span>Show</span>
          {PER_PAGE_OPTIONS.map((opt) => (
            <a
              key={opt}
              href={buildHref({ page: 1, per: opt })}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                opt === perPage
                  ? "bg-foreground/[0.08] text-foreground/60"
                  : "hover:text-foreground/50"
              }`}
            >
              {opt}
            </a>
          ))}
        </div>
        <p className="text-xs text-foreground/30 font-mono tabular-nums">
          {rangeStart}–{rangeEnd} of {data.total.toLocaleString()}
        </p>
      </div>

      <div className="flex-1 min-h-0 border border-foreground/[0.08] rounded overflow-auto thin-scrollbar">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Package
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Version
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Status
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {data.activity.map((install) => {
              const version = extractVersion(install.filename);
              return (
                <tr
                  key={install.id}
                  className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-mono">
                      {install.package_name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-foreground/50 font-mono">
                    {version || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={install.version_status} />
                  </td>
                  <td className="px-4 py-3 text-[13px] text-foreground/30">
                    {formatRelative(install.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 mt-3">
          <p className="text-xs text-foreground/25 font-mono tabular-nums">
            Page {safePage} of {totalPages}
          </p>
          {paginationNav}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    approved: {
      label: "approved",
      classes: "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/15",
    },
    pending: {
      label: "pending",
      classes: "bg-amber-500/10 text-amber-400/80 border-amber-500/15",
    },
    rejected: {
      label: "rejected",
      classes: "bg-red-500/10 text-red-400/80 border-red-500/15",
    },
    blocked: {
      label: "blocked",
      classes: "bg-red-500/10 text-red-400/80 border-red-500/15",
    },
    under_review: {
      label: "reviewing",
      classes: "bg-blue-500/10 text-blue-400/80 border-blue-500/15",
    },
    unreviewed: {
      label: "unreviewed",
      classes:
        "bg-foreground/[0.04] text-foreground/30 border-foreground/[0.08]",
    },
  };

  const c = config[status] || config.unreviewed;

  return (
    <span
      className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border ${c.classes}`}
    >
      {c.label}
    </span>
  );
}

function extractVersion(filename: string): string | null {
  const match = filename.match(/-(\d+\.\d+\.\d+[^.]*)\.tgz$/);
  return match ? match[1] : null;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
