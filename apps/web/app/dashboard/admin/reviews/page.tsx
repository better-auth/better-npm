import { registryFetch } from "@/lib/admin";

interface Review {
  id: string;
  package_version_id: string;
  package_name: string;
  version: string;
  version_status: string;
  reviewer_type: "ai" | "human";
  status: string;
  risk_score: number | null;
  summary: string | null;
  created_at: number;
  completed_at: number | null;
}

export default async function AdminReviews({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || 1));
  const statusFilter = params.status || "";
  const limit = 50;
  const offset = (page - 1) * limit;

  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  const data = (await registryFetch(
    `/api/internal/admin/reviews?${qs}`,
  )) as { reviews: Review[]; total: number };

  const totalPages = Math.ceil(data.total / limit);

  const filterStatuses = [
    { value: "", label: "All" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "needs_human_review", label: "Needs review" },
    { value: "in_progress", label: "In progress" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-foreground/40 font-mono">
            {data.total} review{data.total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-1 overflow-x-auto">
            {filterStatuses.map((f) => (
              <a
                key={f.value}
                href={`/dashboard/admin/reviews${f.value ? `?status=${f.value}` : ""}`}
                className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap ${
                  statusFilter === f.value
                    ? "bg-foreground/[0.08] text-foreground/70"
                    : "text-foreground/30 hover:text-foreground/50"
                }`}
              >
                {f.label}
              </a>
            ))}
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            {page > 1 && (
              <a
                href={`/dashboard/admin/reviews?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
                className="text-foreground/40 hover:text-foreground/60"
              >
                ← prev
              </a>
            )}
            <span className="text-foreground/30">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={`/dashboard/admin/reviews?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
                className="text-foreground/40 hover:text-foreground/60"
              >
                next →
              </a>
            )}
          </div>
        )}
      </div>

      <div className="border border-foreground/[0.08] rounded overflow-auto">
        <table className="w-full text-sm min-w-[650px]">
          <thead>
            <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Package
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Status
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Risk
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Type
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Summary
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {data.reviews.map((review) => (
              <tr
                key={review.id}
                className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02] transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="text-[13px] font-mono">{review.package_name}</p>
                  <p className="text-[11px] text-foreground/30 font-mono">
                    v{review.version}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <ReviewBadge status={review.status} />
                </td>
                <td className="px-4 py-3">
                  <RiskScore score={review.risk_score} />
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/40 font-mono">
                  {review.reviewer_type}
                </td>
                <td className="px-4 py-3 text-[12px] text-foreground/40 max-w-xs truncate">
                  {review.summary || "—"}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/30 whitespace-nowrap">
                  {formatTs(review.created_at)}
                </td>
              </tr>
            ))}
            {data.reviews.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-foreground/25 text-sm"
                >
                  No reviews found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/15",
    rejected: "bg-red-500/10 text-red-400/80 border-red-500/15",
    needs_human_review:
      "bg-amber-500/10 text-amber-400/80 border-amber-500/15",
    in_progress: "bg-blue-500/10 text-blue-400/80 border-blue-500/15",
  };

  return (
    <span
      className={`font-mono text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
        colors[status] ||
        "bg-foreground/[0.04] text-foreground/40 border-foreground/[0.08]"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RiskScore({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-[13px] text-foreground/20">—</span>;
  }

  let color = "text-emerald-400/80";
  if (score >= 0.7) color = "text-red-400/80";
  else if (score >= 0.4) color = "text-amber-400/80";

  return (
    <span className={`text-[13px] font-mono tabular-nums ${color}`}>
      {score.toFixed(2)}
    </span>
  );
}

function formatTs(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
