"use client";

import { useState } from "react";
import {
  Crosshair2Icon,
  MagnifyingGlassIcon,
  CodeIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckIcon,
  CopyIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
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

export default function Home() {
  return (
    <div className="h-dvh overflow-hidden grid grid-rows-[56px_1fr]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 lg:px-12 border-b border-foreground/[0.06]">
        <span className="text-sm tracking-tight">
          better-npm.
        </span>
        <a
          href="/auth/sign-in"
          className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors font-mono"
        >
          Sign in
        </a>
      </nav>

      {/* Content */}
      <main className="grid lg:grid-cols-[1fr_auto] min-h-0">

        {/* Left — hero */}
        <div className="flex items-center justify-center px-8 lg:px-16 xl:px-24">
          <div className="max-w-[32rem] w-full py-12">
            <h1 className="text-2xl sm:text-3xl lg:text-[2.25rem] tracking-tight leading-[1.15]">
              Every npm package release, vetted before it is in your <span className="font-mono text-foreground/60 italic">node_modules</span>
            </h1>

            <p className="mt-6 text-[15px] text-foreground/50 leading-relaxed">
              One line in{" "}
              <code className="font-mono text-[0.9em] text-foreground/60">.npmrc</code>.
              Every install runs through AI that catches malicious code,
              typosquatting, and supply chain attacks before anything lands in{" "}
              <code className="font-mono text-[0.9em] text-foreground/60">node_modules</code>.
            </p>

            {/* Terminal */}
            <div className="mt-10 rounded-lg border border-foreground/[0.08] overflow-hidden">
              {/* Title bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-foreground/[0.03] border-b border-foreground/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-[9px] h-[9px] rounded-full bg-foreground/[0.07]" />
                    <span className="w-[9px] h-[9px] rounded-full bg-foreground/[0.07]" />
                    <span className="w-[9px] h-[9px] rounded-full bg-foreground/[0.07]" />
                  </div>
                  <span className="font-mono text-[11px] text-foreground/25 ml-2">~</span>
                </div>
                <CopyButton text="npx better-npm" />
              </div>
              {/* Command */}
              <div className="px-4 py-3 bg-foreground/[0.015]">
                <code className="font-mono text-[13px] text-foreground/70 flex items-center">
                  <span className="text-emerald-400/50 select-none mr-2">❯</span>
                  npx better-npm
                </code>
              </div>
            </div>

            {/* .npmrc diff */}
            <div className="mt-4 rounded-lg border border-foreground/[0.08] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-foreground/[0.03] border-b border-foreground/[0.06]">
                <span className="font-mono text-[12px] text-foreground/50">.npmrc</span>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-red-400/70">−1</span>
                  <span className="text-emerald-400/70">+1</span>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-1.5 bg-foreground/[0.02] border-b border-foreground/[0.05]">
                <ChevronDownIcon width={10} height={10} className="text-foreground/20" />
                <span className="font-mono text-[10px] text-foreground/20">2 unchanged lines</span>
              </div>

              <div className="font-mono text-[12px]">
                <div className="flex bg-red-500/[0.08]">
                  <span className="select-none w-8 shrink-0 text-right pr-2 py-1.5 text-red-400/25 text-[11px] bg-red-500/[0.06]">3</span>
                  <span className="py-1.5 pl-2 pr-4 text-red-300/60 whitespace-nowrap">
                    <span className="select-none text-red-400/30 mr-1">−</span>
                    registry=<span className="bg-red-400/15 rounded-sm px-0.5">https://registry.npmjs.org/</span>
                  </span>
                </div>
                <div className="flex bg-emerald-500/[0.08]">
                  <span className="select-none w-8 shrink-0 text-right pr-2 py-1.5 text-emerald-400/25 text-[11px] bg-emerald-500/[0.06]">3</span>
                  <span className="py-1.5 pl-2 pr-4 text-emerald-300/60 whitespace-nowrap">
                    <span className="select-none text-emerald-400/30 mr-1">+</span>
                    registry=<span className="bg-emerald-400/15 rounded-sm px-0.5">https://registry.better-npm.dev/</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-1.5 bg-foreground/[0.02] border-t border-foreground/[0.05]">
                <ChevronDownIcon width={10} height={10} className="text-foreground/20" />
                <span className="font-mono text-[10px] text-foreground/20">1 unchanged line</span>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 flex items-center gap-5">
              <a
                href="#"
                className="inline-flex items-center px-6 py-2.5 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Get started &mdash; $8/mo
              </a>
              <span className="text-xs text-foreground/25 font-mono">
                cancel anytime
              </span>
            </div>
          </div>
        </div>

        {/* Right — grid */}
        <div className="hidden lg:block border-l border-foreground/[0.06] overflow-hidden">
          <div className="h-full grid grid-cols-2 grid-rows-3">
            {[
              {
                icon: <Crosshair2Icon width={18} height={18} />,
                title: "Install scripts",
                detail: "postinstall: curl | sh",
              },
              {
                icon: <MagnifyingGlassIcon width={18} height={18} />,
                title: "Typosquatting",
                detail: "expresss, lodahs",
              },
              {
                icon: <CodeIcon width={18} height={18} />,
                title: "Obfuscated code",
                detail: "eval(Buffer.from(...))",
              },
              {
                icon: <LockClosedIcon width={18} height={18} />,
                title: "Credential theft",
                detail: ".ssh, .env, .npmrc",
              },
              {
                icon: <ExclamationTriangleIcon width={18} height={18} />,
                title: "Hijacked deps",
                detail: "env var exfiltration",
              },
              {
                icon: <ClockIcon width={18} height={18} />,
                title: "Rapid publish",
                detail: "50 versions in 24hrs",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`glitch-grid-cell flicker-cell flex flex-col justify-center px-6 py-5 border-b border-foreground/[0.06] ${
                  i % 2 === 0 ? "border-r border-foreground/[0.06]" : ""
                } hover:bg-foreground/[0.02] transition-colors cursor-default`}
              >
                <div className="glitch-scanline" />
                <span className="text-foreground/15 mb-3">{item.icon}</span>
                <h4 className="glitch-title text-[13px] font-medium text-foreground/70">{item.title}</h4>
                <code className="glitch-detail mt-1 font-mono text-[11px] text-foreground/25">{item.detail}</code>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
