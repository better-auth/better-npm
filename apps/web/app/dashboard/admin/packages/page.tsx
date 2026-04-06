import { registryFetch } from "@/lib/admin";

interface Package {
  id: string;
  name: string;
  description: string | null;
  latest_known: string | null;
  weekly_downloads: number;
  created_at: number;
  updated_at: number;
}

const PER_PAGE_OPTIONS = [25, 50, 100] as const;

function buildHref(params: { page?: number; search?: string; per?: number }) {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.search) qs.set("search", params.search);
  if (params.per && params.per !== 50) qs.set("per", String(params.per));
  const s = qs.toString();
  return `/dashboard/admin/packages${s ? `?${s}` : ""}`;
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

export default async function AdminPackages({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.per) as any)
    ? Number(params.per)
    : 50;
  const page = Math.max(1, Number(params.page || 1));
  const search = params.search || "";
  const offset = (page - 1) * perPage;

  const qs = new URLSearchParams({
    limit: String(perPage),
    offset: String(offset),
    ...(search ? { search } : {}),
  });

  const data = (await registryFetch(
    `/api/internal/admin/packages?${qs}`,
  )) as { packages: Package[]; total: number };

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));
  const safePage = Math.min(page, totalPages);
  const rangeStart = data.total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + perPage, data.total);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  const paginationNav = (
    <div className="flex items-center gap-1.5">
      <a
        href={
          safePage > 1
            ? buildHref({ page: safePage - 1, search, per: perPage })
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
          <span key={`ellipsis-${i}`} className="text-foreground/20 px-1 text-xs">
            …
          </span>
        ) : (
          <a
            key={p}
            href={buildHref({ page: p, search, per: perPage })}
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
            ? buildHref({ page: safePage + 1, search, per: perPage })
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
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 mb-4">
        <form method="GET" className="flex items-center gap-2">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search packages..."
            className="bg-transparent border border-foreground/[0.08] rounded px-3 py-1.5 text-[13px] placeholder:text-foreground/20 outline-none focus:border-foreground/[0.15] transition-colors w-40 sm:w-48"
          />
          {perPage !== 50 && (
            <input type="hidden" name="per" value={perPage} />
          )}
        </form>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-foreground/30">
            <span>Show</span>
            {PER_PAGE_OPTIONS.map((opt) => (
              <a
                key={opt}
                href={buildHref({ page: 1, search, per: opt })}
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
      </div>

      <div className="flex-1 min-h-0 border border-foreground/[0.08] rounded overflow-auto thin-scrollbar">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Package
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Latest
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Weekly DL
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {data.packages.map((pkg) => (
              <tr
                key={pkg.id}
                className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02] transition-colors"
              >
                <td className="px-4 py-3">
                  <a
                    href={`/dashboard/admin/packages/${pkg.id}`}
                    className="text-[13px] font-mono hover:text-foreground/70 transition-colors"
                  >
                    {pkg.name}
                  </a>
                  {pkg.description && (
                    <p className="text-[11px] text-foreground/30 mt-0.5 truncate max-w-xs">
                      {pkg.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/50 font-mono">
                  {pkg.latest_known || "—"}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/50 tabular-nums">
                  {pkg.weekly_downloads?.toLocaleString() || "0"}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/30">
                  {formatTs(pkg.updated_at)}
                </td>
              </tr>
            ))}
            {data.packages.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-foreground/25 text-sm"
                >
                  No packages found
                </td>
              </tr>
            )}
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

function formatTs(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
