import { registryFetch } from "@/lib/admin";
import { BlockRulesClient } from "./block-rules-client";

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

export default async function BlockRulesPage() {
  const [rulesData, reportsData] = await Promise.all([
    registryFetch("/api/internal/admin/block-rules") as Promise<{
      rules: BlockRule[];
    }>,
    registryFetch("/api/internal/admin/user-reports").catch(() => ({
      reports: [],
    })) as Promise<{ reports: UserReport[] }>,
  ]);

  const pendingReports = reportsData.reports.filter(
    (r) => !r.is_globally_blocked,
  );

  return (
    <BlockRulesClient
      initialRules={rulesData.rules}
      userReports={pendingReports}
    />
  );
}
