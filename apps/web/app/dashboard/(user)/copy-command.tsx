"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

export function CopyCommand({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
      <code className="font-mono text-[12px] text-foreground/50 truncate">
        {code}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 text-foreground/30 hover:text-foreground/60 transition-colors cursor-pointer"
        aria-label="Copy"
      >
        {copied ? (
          <CheckIcon width={13} height={13} />
        ) : (
          <CopyIcon width={13} height={13} />
        )}
      </button>
    </div>
  );
}
