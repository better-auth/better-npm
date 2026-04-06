export interface Env {
  DB: D1Database;
  TARBALLS: R2Bucket;
  AUTH_CACHE: KVNamespace;
  REVIEW_QUEUE?: Queue<ReviewMessage>;
  UPSTREAM_REGISTRY: string;
  OPENROUTER_API_KEY: string;
  REGISTRY_URL: string;
  WEB_APP_URL: string;
  INTERNAL_SECRET: string;
}

export interface CachedAuth {
  customerId: string;
  email: string;
}

export interface ReviewMessage {
  packageVersionId: string;
  packageName: string;
  version: string;
}

export interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  dist_tags: string | null;
  latest_known: string | null;
  weekly_downloads: number;
  created_at: number;
  updated_at: number;
}

export interface PackageVersionRow {
  id: string;
  package_id: string;
  version: string;
  tarball_sha: string;
  status: "pending" | "approved" | "rejected" | "under_review";
  created_at: number;
}

export interface ReviewRow {
  id: string;
  package_version_id: string;
  reviewer_type: "ai" | "human";
  status: "approved" | "rejected" | "needs_human_review" | "in_progress";
  risk_score: number | null;
  findings: string | null;
  summary: string | null;
  created_at: number;
  completed_at: number | null;
}
