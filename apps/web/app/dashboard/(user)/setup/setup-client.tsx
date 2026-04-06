"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

export function SetupClient() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CopyCard
        title="Install the CLI"
        description="Run this once to connect your project to the better-npm registry."
        code="npx @better-npm/cli"
      />
      <div className="rounded border border-foreground/[0.08]">
        <div className="border-b border-foreground/[0.06] bg-foreground/[0.02] px-5 py-4">
          <h3 className="text-sm font-medium">Getting started</h3>
        </div>
        <div className="space-y-3 px-5 py-5">
          {[
            "Install the Better NPM CLI locally or in CI.",
            "Authenticate and point your workflow at the better-npm registry.",
            "Upgrade when you need higher usage limits.",
          ].map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded border border-foreground/[0.06] px-3 py-3"
            >
              <CheckIcon
                width={14}
                height={14}
                className="mt-0.5 shrink-0 text-emerald-400/70"
              />
              <p className="text-sm text-foreground/60">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CopyCard({
  title,
  description,
  code,
}: {
  title: string;
  description: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded border border-foreground/[0.08] p-5 transition-colors hover:border-foreground/[0.12]">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-foreground/40">{description}</p>
      <div className="mt-4 flex items-center justify-between rounded-sm bg-foreground/[0.03] px-3 py-2">
        <code className="font-mono text-[13px] text-foreground/50">
          {code}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-foreground/30 hover:text-foreground/60 transition-colors shrink-0 cursor-pointer"
          aria-label="Copy"
        >
          {copied ? (
            <CheckIcon width={14} height={14} />
          ) : (
            <CopyIcon width={14} height={14} />
          )}
        </button>
      </div>
    </div>
  );
}
