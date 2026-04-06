"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

export function LandingCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-foreground/40 hover:text-foreground/70 transition-colors shrink-0 light:text-foreground/50 light:hover:text-foreground/80"
      aria-label="Copy"
    >
      {copied ? (
        <CheckIcon width={14} height={14} />
      ) : (
        <CopyIcon width={14} height={14} />
      )}
    </button>
  );
}
