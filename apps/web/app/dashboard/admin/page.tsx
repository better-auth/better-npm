import { registryFetch } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function AdminOverview() {
  const [registryStats, usersResult] = await Promise.all([
    registryFetch("/api/internal/admin/stats") as Promise<Record<string, number>>,
    auth.api.listUsers({ headers: await headers(), query: { limit: 1 } }),
  ]);

  const totalUsers = usersResult.total;

  const stats = [
    { label: "Total installs", value: registryStats.totalInstalls },
    { label: "Installs today", value: registryStats.installsToday },
    { label: "Installs (7d)", value: registryStats.installsWeek },
    { label: "Total users", value: totalUsers },
    { label: "Tracked packages", value: registryStats.packages },
    { label: "Package versions", value: registryStats.versions },
    { label: "Approved versions", value: registryStats.approvedVersions },
    { label: "Pending versions", value: registryStats.pendingVersions },
    { label: "Rejected versions", value: registryStats.rejectedVersions },
    { label: "Total reviews", value: registryStats.reviews },
    { label: "Reviews (24h)", value: registryStats.recentReviews },
    { label: "Registry customers", value: registryStats.customers },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="border border-foreground/[0.08] rounded p-4 hover:border-foreground/[0.12] transition-colors"
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
            {s.label}
          </p>
          <p className="text-xl font-medium mt-1.5 tabular-nums">
            {s.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
