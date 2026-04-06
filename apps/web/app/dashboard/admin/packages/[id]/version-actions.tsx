"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VersionActions({
  versionId,
  currentStatus,
}: {
  versionId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function setStatus(status: string) {
    setLoading(status);
    try {
      await fetch(`/api/admin/versions/${versionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {currentStatus !== "rejected" && (
        <button
          onClick={() => setStatus("rejected")}
          disabled={loading !== null}
          className="px-2 py-1 text-[11px] rounded border border-red-500/15 text-red-400/70 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === "rejected" ? "…" : "Reject"}
        </button>
      )}
      {currentStatus !== "approved" && (
        <button
          onClick={() => setStatus("approved")}
          disabled={loading !== null}
          className="px-2 py-1 text-[11px] rounded border border-emerald-500/15 text-emerald-400/70 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === "approved" ? "…" : "Approve"}
        </button>
      )}
    </div>
  );
}
