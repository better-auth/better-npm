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

export default async function BlockRulesPage() {
  const data = (await registryFetch("/api/internal/admin/block-rules")) as {
    rules: BlockRule[];
  };

  return <BlockRulesClient initialRules={data.rules} />;
}
