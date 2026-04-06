import { ChevronDownIcon } from "@radix-ui/react-icons";
import { registryFetch } from "@/lib/admin";
import { LandingCopyButton } from "./landing-copy-button";
import { FeatureHint } from "./feature-hint";
import { ScrollingPackages } from "./scrolling-packages";

export default async function Home() {
  const stats = await registryFetch("/api/internal/admin/stats").catch(
    () => ({ totalInstalls: 0, packages: 0, approvedVersions: 0 }),
  ) as Record<string, number>;

  return (
    <div className="h-dvh grid grid-rows-[56px_1fr] overflow-hidden">
      <nav className="flex items-center justify-between px-4 sm:px-8 lg:px-12">
        <span className="text-sm tracking-tight">
          better-npm.
        </span>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/better-auth/better-npm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground/40 hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="/auth/sign-in"
            className="text-sm text-foreground hover:text-foreground/80 transition-colors"
          >
            Sign in
          </a>
        </div>
      </nav>

      <main className="min-h-0 warm-gradient-bg relative">

        <ScrollingPackages />

        <div className="relative h-full overflow-y-auto flex items-start sm:items-center justify-center px-4 sm:px-8 lg:px-16 xl:px-24 py-6 sm:py-16">

          <div className="max-w-lg w-full text-center">
            <h1 className="text-[1.35rem] sm:text-3xl lg:text-[2.25rem] tracking-tight leading-[1.15]">
              Every npm package release, vetted before it reaches your <span className="font-mono text-foreground/60 italic light:text-foreground/50">node_modules</span>
            </h1>

            <p className="mt-4 sm:mt-6 text-[13.5px] sm:text-[15px] text-foreground/50 leading-relaxed light:text-foreground/60">
              Point your{" "}
              <code className="font-mono text-[0.9em] text-foreground/60 light:text-foreground/70">.npmrc</code>{" "}
              at the registry. Each new release is scanned for{" "}
              <FeatureHint label="malicious code" tip="Install scripts, obfuscated payloads, and data exfiltration patterns are caught on every new version." />,{" "}
              <FeatureHint label="typosquatting" tip="Frontier models hallucinate package names ~5% of the time, making AI-generated code a prime target for typosquats. Known typosquats are blocked by default." />,{" "}
              and{" "}
              <FeatureHint label="supply chain attacks" tip="Compromised maintainers, dependency confusion, and hijacked packages are flagged and held." />{" "}
              before it's served.
            </p>

            <div className="mt-6 sm:mt-10 rounded border border-foreground/[0.08] light:border-foreground/15 overflow-hidden bg-background">
              <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 bg-foreground/[0.03] light:bg-foreground/[0.06] border-b border-foreground/[0.06] light:border-foreground/10">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-[9px] h-[9px] rounded-full bg-foreground/[0.07] light:bg-foreground/15" />
                    <span className="w-[9px] h-[9px] rounded-full bg-foreground/[0.07] light:bg-foreground/15" />
                    <span className="w-[9px] h-[9px] rounded-full bg-foreground/[0.07] light:bg-foreground/15" />
                  </div>
                  <span className="font-mono text-[11px] text-foreground/25 light:text-foreground/40 ml-2">~</span>
                </div>
                <LandingCopyButton text="npx @better-npm/cli" />
              </div>
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-foreground/[0.015] light:bg-foreground/[0.03]">
                <code className="font-mono text-[12px] sm:text-[13px] text-foreground/70 flex items-center">
                  <span className="text-emerald-400/50 light:text-emerald-600/70 select-none mr-2">❯</span>
                  npx @better-npm/cli
                </code>
              </div>
            </div>

            <div className="mt-3 sm:mt-4 rounded border border-foreground/[0.08] light:border-foreground/15 overflow-hidden bg-background overflow-x-auto">
              <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-foreground/[0.03] light:bg-foreground/[0.06] border-b border-foreground/[0.06] light:border-foreground/10">
                <span className="font-mono text-[11px] sm:text-[12px] text-foreground/50">.npmrc</span>
                <div className="flex items-center gap-2 font-mono text-[10px] sm:text-[11px]">
                  <span className="text-red-400/70 light:text-red-600">−1</span>
                  <span className="text-emerald-400/70 light:text-emerald-600">+1</span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-foreground/[0.02] light:bg-foreground/[0.04] border-b border-foreground/[0.05] light:border-foreground/10">
                <ChevronDownIcon width={10} height={10} className="text-foreground/20 light:text-foreground/40" />
                <span className="font-mono text-[10px] text-foreground/20 light:text-foreground/40">2 unchanged lines</span>
              </div>

              <div className="font-mono text-[11px] sm:text-[12px]">
                <div className="flex bg-red-500/[0.08] light:bg-red-50">
                  <span className="select-none w-7 sm:w-8 shrink-0 text-right pr-2 py-1.5 text-red-400/25 light:text-red-500/50 text-[10px] sm:text-[11px] bg-red-500/[0.06] light:bg-red-100/60">3</span>
                  <span className="py-1.5 pl-2 pr-3 sm:pr-4 text-red-300/60 light:text-red-700/80 whitespace-nowrap">
                    <span className="select-none text-red-400/30 light:text-red-500/60 mr-1">−</span>
                    registry=<span className="bg-red-400/15 light:bg-red-200/60 rounded-sm px-0.5">https://registry.npmjs.org/</span>
                  </span>
                </div>
                <div className="flex bg-emerald-500/[0.08] light:bg-emerald-50">
                  <span className="select-none w-7 sm:w-8 shrink-0 text-right pr-2 py-1.5 text-emerald-400/25 light:text-emerald-600/50 text-[10px] sm:text-[11px] bg-emerald-500/[0.06] light:bg-emerald-100/60">3</span>
                  <span className="py-1.5 pl-2 pr-3 sm:pr-4 text-emerald-300/60 light:text-emerald-700/80 whitespace-nowrap">
                    <span className="select-none text-emerald-400/30 light:text-emerald-500/60 mr-1">+</span>
                    registry=<span className="bg-emerald-400/15 light:bg-emerald-200/60 rounded-sm px-0.5">https://registry.better-npm.dev/</span>
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-foreground/[0.02] light:bg-foreground/[0.04] border-t border-foreground/[0.05] light:border-foreground/10">
                <ChevronDownIcon width={10} height={10} className="text-foreground/20 light:text-foreground/40" />
                <span className="font-mono text-[10px] text-foreground/20 light:text-foreground/40">1 unchanged line</span>
              </div>
            </div>


            {(stats.totalInstalls > 0 || stats.approvedVersions > 0) && (
              <div className="mt-4 sm:mt-6 flex items-center justify-center gap-6 sm:gap-8">
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-medium tabular-nums">
                    {stats.totalInstalls.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-foreground/30 mt-1">
                    installs
                  </p>
                </div>
                <div className="w-px h-8 bg-foreground/[0.08]" />
                <div className="text-center">
                  <p className="text-lg sm:text-xl font-medium tabular-nums">
                    {stats.approvedVersions.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-foreground/30 mt-1">
                    releases scanned
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>

      </main>
    </div>
  );
}
