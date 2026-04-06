"use client";

const NEUTRAL =
  "text-foreground/20 border-foreground/[0.06] light:text-foreground/30 light:border-foreground/10";
const SAFE =
  "text-emerald-400/35 border-emerald-400/12 light:text-emerald-600/35 light:border-emerald-500/12";
const FLAGGED =
  "text-red-400/35 border-red-400/12 light:text-red-600/35 light:border-red-500/12";

const ROWS = [
  ["react", "express", "lodash", "axios", "next", "typescript", "webpack", "vue", "zod", "prisma", "eslint", "prettier", "vite", "tailwindcss", "jest"],
  ["svelte", "hono", "fastify", "drizzle-orm", "socket.io", "mongoose", "redis", "sharp", "puppeteer", "commander", "chalk", "dayjs", "uuid", "semver", "cors"],
  ["electron", "stripe", "firebase", "pg", "winston", "debug", "glob", "cheerio", "bcrypt", "nodemailer", "multer", "helmet", "morgan", "dotenv", "pino"],
];

const FLAGGED_PER_ROW: Set<number>[] = [
  new Set([3, 11]),
  new Set([5, 9]),
  new Set([1, 7, 13]),
];

function MarqueeRow({
  packages,
  duration,
  side,
  flagged,
}: {
  packages: string[];
  duration: number;
  side: "left" | "right";
  flagged?: Set<number>;
}) {
  const doubled = [...packages, ...packages];

  return (
    <div className="flex overflow-hidden">
      <div
        className="animate-marquee-reverse"
        style={{ animationDuration: `${duration}s` }}
      >
        <div className="flex gap-2 sm:gap-3 pr-2 sm:pr-3">
          {doubled.map((pkg, i) => {
            let color: string;
            if (side === "left") {
              color = NEUTRAL;
            } else {
              color = flagged?.has(i % packages.length) ? FLAGGED : SAFE;
            }
            return (
              <span
                key={`${pkg}-${i}`}
                className={`shrink-0 font-mono text-[10px] sm:text-[11.5px] px-2 sm:px-2.5 py-1 sm:py-1.5 rounded border whitespace-nowrap ${color}`}
              >
                {pkg}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ScrollingPackages() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* Left half – neutral/grey pills */}
      <div
        className="absolute inset-0 flex flex-col justify-center gap-2 sm:gap-2.5"
        style={{ clipPath: "inset(0 50% 0 0)" }}
      >
        {ROWS.map((row, i) => (
          <MarqueeRow
            key={i}
            packages={row}
            duration={45 + i * 10}
            side="left"
          />
        ))}
      </div>

      {/* Right half – green (safe) & red (flagged) pills */}
      <div
        className="absolute inset-0 flex flex-col justify-center gap-2 sm:gap-2.5"
        style={{ clipPath: "inset(0 0 0 50%)" }}
      >
        {ROWS.map((row, i) => (
          <MarqueeRow
            key={i}
            packages={row}
            duration={45 + i * 10}
            side="right"
            flagged={FLAGGED_PER_ROW[i]}
          />
        ))}
      </div>

      {/* Center fade – keeps hero content readable, wider on mobile */}
      <div className="absolute inset-0 landing-center-fade" />
    </div>
  );
}
