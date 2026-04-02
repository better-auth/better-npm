import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { Env } from "../types.js";

export interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  message: string;
}

export interface AnalysisResult {
  riskScore: number;
  findings: Finding[];
  summary: string;
}

const reviewSchema = z.object({
  riskScore: z.number().min(0).max(1),
  findings: z.array(
    z.object({
      severity: z.enum(["critical", "high", "medium", "low", "info"]),
      category: z.string(),
      message: z.string(),
    }),
  ),
  summary: z.string(),
});

export async function analyzePackage(
  env: Env,
  packageName: string,
  version: string,
): Promise<AnalysisResult> {
  const url = `${env.UPSTREAM_REGISTRY}/${encodeURIComponent(packageName).replace("%40", "@")}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return {
      riskScore: 1.0,
      findings: [{ severity: "critical", category: "existence", message: "Package not found on upstream" }],
      summary: "Package does not exist on npm.",
    };
  }

  const metadata: any = await res.json();
  const versionData = metadata.versions?.[version];
  if (!versionData) {
    return {
      riskScore: 1.0,
      findings: [{ severity: "critical", category: "existence", message: `Version ${version} not found` }],
      summary: `Version ${version} does not exist.`,
    };
  }

  const staticFindings = runStaticAnalysis(metadata, versionData);
  const aiResult = await runAIAnalysis(env, metadata, versionData, version);
  const allFindings = [...staticFindings, ...aiResult.findings];
  const staticScore = computeStaticScore(staticFindings);
  const combinedScore = Math.min(1.0, staticScore * 0.4 + aiResult.riskScore * 0.6);

  return { riskScore: combinedScore, findings: allFindings, summary: aiResult.summary };
}

function runStaticAnalysis(metadata: any, versionData: any): Finding[] {
  const findings: Finding[] = [];
  const scripts = versionData.scripts || {};

  const dangerousScripts = ["preinstall", "postinstall", "install"];
  for (const script of dangerousScripts) {
    if (scripts[script]) {
      findings.push({
        severity: "high",
        category: "install-scripts",
        message: `Has ${script} script: "${scripts[script]}"`,
      });

      const networkPatterns = ["curl", "wget", "fetch(", "http://", "https://", "node -e", "eval("];
      for (const pattern of networkPatterns) {
        if (scripts[script].toLowerCase().includes(pattern)) {
          findings.push({
            severity: "critical",
            category: "network-install",
            message: `Install script contains suspicious pattern: ${pattern}`,
          });
        }
      }
    }
  }

  const deps = { ...versionData.dependencies, ...versionData.optionalDependencies };
  if (Object.keys(deps || {}).length > 50) {
    findings.push({
      severity: "medium",
      category: "dependency-count",
      message: `Unusually high dependency count: ${Object.keys(deps).length}`,
    });
  }

  const popularPackages = [
    "express", "react", "lodash", "axios", "moment", "chalk",
    "commander", "debug", "dotenv", "webpack", "eslint",
    "typescript", "next", "vue", "angular", "svelte", "hono",
  ];
  const name = metadata.name?.replace(/^@[^/]+\//, "") || "";
  for (const popular of popularPackages) {
    if (name !== popular && levenshtein(name, popular) <= 2) {
      findings.push({
        severity: "high",
        category: "typosquatting",
        message: `"${metadata.name}" is suspiciously similar to "${popular}"`,
      });
    }
  }

  const versionCount = Object.keys(metadata.versions || {}).length;
  const daysSinceCreation =
    (Date.now() - new Date(metadata.time?.created || 0).getTime()) / 86_400_000;
  if (daysSinceCreation < 7 && versionCount > 10) {
    findings.push({
      severity: "medium",
      category: "rapid-publish",
      message: `New package (${Math.round(daysSinceCreation)}d old) with ${versionCount} versions`,
    });
  }

  if ((metadata.maintainers || []).length === 0) {
    findings.push({
      severity: "medium",
      category: "no-maintainers",
      message: "Package has no listed maintainers",
    });
  }

  return findings;
}

function computeStaticScore(findings: Finding[]): number {
  let score = 0;
  for (const f of findings) {
    if (f.severity === "critical") score += 0.4;
    else if (f.severity === "high") score += 0.25;
    else if (f.severity === "medium") score += 0.1;
    else if (f.severity === "low") score += 0.05;
  }
  return Math.min(1.0, score);
}

async function runAIAnalysis(
  env: Env,
  metadata: any,
  versionData: any,
  version: string,
): Promise<{ riskScore: number; findings: Finding[]; summary: string }> {
  if (!env.OPENROUTER_API_KEY) {
    return {
      riskScore: 0.5,
      findings: [{ severity: "info", category: "ai-unavailable", message: "No API key configured" }],
      summary: "AI analysis not available. Manual review recommended.",
    };
  }

  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: env.OPENROUTER_API_KEY,
  });

  const prompt = `Package: ${metadata.name}@${version}
Description: ${metadata.description || "none"}
License: ${versionData.license || "none"}
Homepage: ${metadata.homepage || "none"}
Repository: ${JSON.stringify(metadata.repository || "none")}
Maintainers: ${JSON.stringify(metadata.maintainers || [])}
Total versions: ${Object.keys(metadata.versions || {}).length}
Created: ${metadata.time?.created || "unknown"}
This version published: ${metadata.time?.[version] || "unknown"}

Scripts:
${JSON.stringify(versionData.scripts || {}, null, 2)}

Dependencies:
${JSON.stringify(versionData.dependencies || {}, null, 2)}

Optional Dependencies:
${JSON.stringify(versionData.optionalDependencies || {}, null, 2)}

Analyze this package for supply chain risk.`;

  try {
    const { object } = await generateObject({
      model: openrouter("google/gemini-2.0-flash-001"),
      schema: reviewSchema,
      system: `You are a security analyst reviewing npm packages for supply chain attacks.

Risk score guide:
- 0.0-0.2: Safe, well-known, no issues
- 0.2-0.5: Minor concerns but likely safe
- 0.5-0.7: Suspicious patterns, needs human review
- 0.7-0.85: Likely malicious or very risky
- 0.85-1.0: Almost certainly malicious

Watch for: obfuscated install scripts, data exfiltration, typosquatting, maintainer takeovers, network calls during install.`,
      prompt,
      temperature: 0.1,
    });

    return {
      riskScore: Math.max(0, Math.min(1, object.riskScore)),
      findings: object.findings,
      summary: object.summary,
    };
  } catch (err) {
    console.error("AI analysis failed:", err);
    return {
      riskScore: 0.5,
      findings: [{ severity: "info", category: "ai-error", message: "AI analysis failed" }],
      summary: "AI analysis encountered an error.",
    };
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
