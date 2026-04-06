import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { registryFetch } from "@/lib/admin";
import { BlockRulesClient } from "./block-rules-client";

interface BlockRule {
  id: string;
  customer_id: string;
  package_name: string;
  version_pattern: string;
  reason: string | null;
  created_at: number;
}

export default async function UserBlockRulesPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const email = session?.user?.email;

  const [rulesData, settingsData] = await Promise.all([
    email
      ? (registryFetch(
          `/api/internal/user/block-rules?email=${encodeURIComponent(email)}`,
        ).catch(() => ({ rules: [] })) as Promise<{ rules: BlockRule[] }>)
      : Promise.resolve({ rules: [] as BlockRule[] }),
    email
      ? (registryFetch(
          `/api/internal/user/settings?email=${encodeURIComponent(email)}`,
        ).catch(() => ({ min_weekly_downloads: null })) as Promise<{
          min_weekly_downloads: number | null;
        }>)
      : Promise.resolve({ min_weekly_downloads: null }),
  ]);

  return (
    <BlockRulesClient
      initialRules={rulesData.rules}
      initialMinDownloads={settingsData.min_weekly_downloads}
    />
  );
}
