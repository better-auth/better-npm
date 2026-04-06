import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { registryFetch } from "@/lib/admin";
import { InstallHeatmap } from "./install-heatmap";

export const metadata: Metadata = {
  title: "Dashboard — better-npm",
};

export default async function OverviewPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const email = session?.user?.email;

  const [userStats, extendedStats, heatmapData] = await Promise.all([
    email
      ? (registryFetch(
          `/api/internal/user/stats?email=${encodeURIComponent(email)}`,
        ).catch(() => ({
          installsToday: 0,
          installsWeek: 0,
          totalInstalls: 0,
          packages: 0,
        })) as Promise<Record<string, number>>)
      : Promise.resolve({
          installsToday: 0,
          installsWeek: 0,
          totalInstalls: 0,
          packages: 0,
        } as Record<string, number>),
    email
      ? (registryFetch(
          `/api/internal/user/stats/extended?email=${encodeURIComponent(email)}`,
        ).catch(() => ({
          mostInstalledPackage: null,
          uniquePackages: 0,
          cacheHitRate: 0,
          busiestDay: null,
          installsThisMonth: 0,
          streak: 0,
          blockedPackages: 0,
        })) as Promise<{
          mostInstalledPackage: { name: string; count: number } | null;
          uniquePackages: number;
          cacheHitRate: number;
          busiestDay: { day: string; count: number } | null;
          installsThisMonth: number;
          streak: number;
          blockedPackages: number;
        }>)
      : Promise.resolve({
          mostInstalledPackage: null,
          uniquePackages: 0,
          cacheHitRate: 0,
          busiestDay: null,
          installsThisMonth: 0,
          streak: 0,
          blockedPackages: 0,
        }),
    email
      ? (registryFetch(
          `/api/internal/user/stats/heatmap?email=${encodeURIComponent(email)}`,
        ).catch(() => ({ days: [] })) as Promise<{
          days: {
            date: string;
            count: number;
            packages: { name: string; count: number }[];
          }[];
        }>)
      : Promise.resolve({ days: [] }),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total installs"
          value={userStats.totalInstalls.toLocaleString()}
          detail="all time"
        />
        <StatCard
          label="Installs this week"
          value={userStats.installsWeek.toLocaleString()}
          detail={`${userStats.installsToday.toLocaleString()} today`}
        />
        <StatCard
          label="Last 30 days"
          value={extendedStats.installsThisMonth.toLocaleString()}
          detail="installs"
        />
      </div>

      <InstallHeatmap days={heatmapData.days} />

      <div className="rounded border border-foreground/[0.08] overflow-hidden">
        <div className="border-b border-foreground/[0.06] bg-foreground/[0.02] px-5 py-4">
          <h3 className="text-sm font-medium">Your stats</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-foreground/[0.06]">
          <MiniStat
            label="Top package"
            value={extendedStats.mostInstalledPackage?.name ?? "—"}
            detail={
              extendedStats.mostInstalledPackage
                ? `${extendedStats.mostInstalledPackage.count.toLocaleString()} installs`
                : "no installs yet"
            }
          />
          <MiniStat
            label="Unique packages"
            value={extendedStats.uniquePackages.toLocaleString()}
            detail="distinct packages"
          />
          <MiniStat
            label="Cache hit rate"
            value={`${extendedStats.cacheHitRate}%`}
            detail="of all installs"
          />
          <MiniStat
            label="Busiest day"
            value={extendedStats.busiestDay?.day ?? "—"}
            detail={
              extendedStats.busiestDay
                ? `${extendedStats.busiestDay.count.toLocaleString()} installs`
                : "no data"
            }
          />
          <MiniStat
            label="Blocked packages"
            value={(extendedStats.blockedPackages ?? 0).toLocaleString()}
            detail={(extendedStats.blockedPackages ?? 0) === 0 ? "all clear" : "flagged or blocked"}
          />
          <MiniStat
            label="Current streak"
            value={(extendedStats.streak ?? 0).toLocaleString()}
            detail={(extendedStats.streak ?? 0) === 1 ? "day" : "days"}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="border border-foreground/[0.08] rounded p-5 hover:border-foreground/[0.12] transition-colors">
      <p className="text-[11px] font-mono uppercase tracking-wider text-foreground/30">
        {label}
      </p>
      <p className="mt-2 text-2xl font-medium tabular-nums capitalize">
        {value}
      </p>
      <p className="text-xs text-foreground/25 mt-1">{detail}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-background px-5 py-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-medium tabular-nums truncate">
        {value}
      </p>
      <p className="text-[11px] text-foreground/25 mt-0.5">{detail}</p>
    </div>
  );
}
