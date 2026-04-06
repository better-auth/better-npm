"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface BlockRule {
  id: string;
  package_name: string;
  version_pattern: string;
  reason: string | null;
  created_by: string | null;
  created_at: number;
}

interface Reporter {
  email: string;
  reason: string;
  created_at: number;
}

interface UserReport {
  package_name: string;
  version_pattern: string;
  report_count: number;
  reporters: Reporter[];
  latest_report: number;
  is_globally_blocked: boolean;
}

export function BlockRulesClient({
  initialRules,
  userReports = [],
}: {
  initialRules: BlockRule[];
  userReports?: UserReport[];
}) {
  const router = useRouter();
  const [packageName, setPackageName] = useState("");
  const [versionPattern, setVersionPattern] = useState("*");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  function getReportKey(report: UserReport) {
    return `${report.package_name}:${report.version_pattern}`;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!packageName.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/admin/block-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_name: packageName.trim(),
          version_pattern: versionPattern.trim() || "*",
          reason: reason.trim() || undefined,
        }),
      });
      setPackageName("");
      setVersionPattern("*");
      setReason("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/admin/block-rules/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handlePromoteToGlobal(report: UserReport) {
    const reportKey = getReportKey(report);
    setPromoting(reportKey);
    const reasons = report.reporters.map((r) => r.reason).filter(Boolean);
    const combinedReason = `User report for ${report.version_pattern}${report.report_count > 1 ? ` (${report.report_count} users)` : ""}: ${reasons[0]}${reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ""}`;
    try {
      await fetch("/api/admin/block-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_name: report.package_name,
          version_pattern: "*",
          reason: combinedReason,
        }),
      });
      router.refresh();
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* User reports section */}
      {userReports.length > 0 && (
        <div className="rounded border border-amber-500/15 overflow-hidden">
          <div className="border-b border-amber-500/10 bg-amber-500/[0.04] px-5 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-amber-400/90">
                User reports
              </h3>
              <p className="text-[11px] text-amber-400/50 mt-0.5">
                Packages blocked by users with a reason — review and promote to
                global blocks
              </p>
            </div>
            <span className="text-xs font-mono bg-amber-500/10 text-amber-400/80 border border-amber-500/15 rounded-full px-2 py-0.5">
              {userReports.length}
            </span>
          </div>
          <div className="divide-y divide-foreground/[0.04]">
            {userReports.map((report) => (
              <div key={getReportKey(report)}>
                <div
                  className="flex items-center gap-4 px-5 py-3 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
                  onClick={() =>
                    setExpandedReport(
                      expandedReport === getReportKey(report)
                        ? null
                        : getReportKey(report),
                    )
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px]">
                        {report.package_name}
                      </span>
                      <span className="text-[10px] font-mono bg-foreground/[0.04] text-foreground/55 border border-foreground/[0.08] rounded px-1.5 py-0.5">
                        {report.version_pattern}
                      </span>
                      {report.report_count > 1 && (
                        <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400/70 border border-amber-500/15 rounded px-1.5 py-0.5">
                          {report.report_count} report
                          {report.report_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-foreground/40 mt-0.5 truncate">
                      {report.reporters[0]?.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromoteToGlobal(report);
                      }}
                      disabled={promoting === getReportKey(report)}
                      className="px-3 py-1.5 text-[11px] rounded border border-red-500/20 text-red-400/80 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {promoting === getReportKey(report)
                        ? "Blocking…"
                        : "Block globally"}
                    </button>
                    <span className="text-foreground/20 text-xs">
                      {expandedReport === getReportKey(report) ? "▾" : "▸"}
                    </span>
                  </div>
                </div>

                {expandedReport === getReportKey(report) && (
                  <div className="border-t border-foreground/[0.04] bg-foreground/[0.015] px-5 py-3">
                    <div className="space-y-2">
                      {report.reporters.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 text-[12px]"
                        >
                          <span className="text-foreground/30 font-mono shrink-0">
                            {r.email}
                          </span>
                          <span className="text-foreground/50">
                            &ldquo;{r.reason}&rdquo;
                          </span>
                          <span className="text-foreground/20 shrink-0 ml-auto">
                            {formatTs(r.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {report.report_count > report.reporters.length && (
                      <p className="text-[11px] text-foreground/30">
                        Showing the latest {report.reporters.length} of{" "}
                        {report.report_count} reports.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add block rule form */}
      <form
        onSubmit={handleAdd}
        className="rounded border border-foreground/[0.08] p-5"
      >
        <h3 className="text-sm font-medium mb-4">Add block rule</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-foreground/30 block mb-1.5">
              Package name
            </label>
            <input
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="e.g. left-pad"
              required
              className="w-full bg-transparent border border-foreground/[0.08] rounded px-3 py-1.5 text-[13px] placeholder:text-foreground/20 outline-none focus:border-foreground/[0.15] transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-foreground/30 block mb-1.5">
              Version pattern
            </label>
            <input
              value={versionPattern}
              onChange={(e) => setVersionPattern(e.target.value)}
              placeholder="* or >=1.0.0 <2.0.0"
              className="w-full bg-transparent border border-foreground/[0.08] rounded px-3 py-1.5 text-[13px] placeholder:text-foreground/20 outline-none focus:border-foreground/[0.15] transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-foreground/30 block mb-1.5">
              Reason (optional)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. supply chain attack"
              className="w-full bg-transparent border border-foreground/[0.08] rounded px-3 py-1.5 text-[13px] placeholder:text-foreground/20 outline-none focus:border-foreground/[0.15] transition-colors"
            />
          </div>
        </div>
        <p className="text-[11px] text-foreground/25 mt-2">
          Supports semver ranges:{" "}
          <code className="text-foreground/35">*</code> (all versions),{" "}
          <code className="text-foreground/35">1.2.3</code> (exact),{" "}
          <code className="text-foreground/35">
            {">"}=1.0.0 {"<"}2.0.0
          </code>{" "}
          (range), <code className="text-foreground/35">^1.0.0</code>,{" "}
          <code className="text-foreground/35">~1.0.0</code>
        </p>
        <button
          type="submit"
          disabled={submitting || !packageName.trim()}
          className="mt-3 px-4 py-1.5 text-[13px] rounded border border-red-500/20 text-red-400/80 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Block"}
        </button>
      </form>

      {/* Global block rules table */}
      <div className="border border-foreground/[0.08] rounded overflow-auto">
        <table className="w-full text-sm min-w-[550px]">
          <thead>
            <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Package
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Pattern
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Reason
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Added
              </th>
              <th className="text-right px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {initialRules.map((rule) => (
              <tr
                key={rule.id}
                className="border-b border-foreground/[0.04] last:border-0"
              >
                <td className="px-4 py-3 font-mono text-[13px]">
                  {rule.package_name}
                </td>
                <td className="px-4 py-3 font-mono text-[13px] text-foreground/50">
                  {rule.version_pattern}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/40">
                  {rule.reason || "—"}
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/30">
                  {formatTs(rule.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(rule.id)}
                    disabled={deleting === rule.id}
                    className="px-2 py-1 text-[11px] rounded border border-foreground/[0.08] text-foreground/40 hover:text-foreground hover:border-foreground/[0.15] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {deleting === rule.id ? "…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {initialRules.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-foreground/25 text-sm"
                >
                  No block rules — all packages pass through
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
