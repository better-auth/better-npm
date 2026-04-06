import { registryFetch } from "@/lib/admin";
import { VersionActions } from "./version-actions";

interface Version {
  id: string;
  package_id: string;
  version: string;
  tarball_sha: string;
  status: string;
  created_at: number;
}

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = (await registryFetch(
    `/api/internal/admin/packages/${id}/versions`,
  )) as { versions: Version[] };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <a
            href="/dashboard/admin/packages"
            className="text-xs text-foreground/30 hover:text-foreground/50 transition-colors"
          >
            ← Back to packages
          </a>
          <h2 className="text-sm font-medium mt-1">
            Versions ({data.versions.length})
          </h2>
        </div>
      </div>

      <div className="border border-foreground/[0.08] rounded overflow-auto">
        <table className="w-full text-sm min-w-[450px]">
          <thead>
            <tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Version
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Status
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Tracked
              </th>
              <th className="text-right px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-foreground/30 font-normal">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {data.versions.map((v) => (
              <tr
                key={v.id}
                className="border-b border-foreground/[0.04] last:border-0"
              >
                <td className="px-4 py-3 font-mono text-[13px]">
                  {v.version}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-4 py-3 text-[13px] text-foreground/30">
                  {formatTs(v.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <VersionActions versionId={v.id} currentStatus={v.status} />
                </td>
              </tr>
            ))}
            {data.versions.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-foreground/25 text-sm"
                >
                  No tracked versions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/15",
    rejected: "bg-red-500/10 text-red-400/80 border-red-500/15",
    pending: "bg-amber-500/10 text-amber-400/80 border-amber-500/15",
  };

  return (
    <span
      className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
        colors[status] || "bg-foreground/[0.04] text-foreground/40 border-foreground/[0.08]"
      }`}
    >
      {status}
    </span>
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
