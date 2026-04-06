"use client";

const COLORS = [
  "text-sky-400/30 border-sky-400/10 light:text-sky-600/30 light:border-sky-500/10",
  "text-violet-400/30 border-violet-400/10 light:text-violet-600/30 light:border-violet-500/10",
  "text-emerald-400/30 border-emerald-400/10 light:text-emerald-600/30 light:border-emerald-500/10",
  "text-amber-400/30 border-amber-400/10 light:text-amber-600/30 light:border-amber-500/10",
  "text-rose-400/30 border-rose-400/10 light:text-rose-600/30 light:border-rose-500/10",
  "text-teal-400/30 border-teal-400/10 light:text-teal-600/30 light:border-teal-500/10",
  "text-indigo-400/30 border-indigo-400/10 light:text-indigo-600/30 light:border-indigo-500/10",
  "text-orange-400/30 border-orange-400/10 light:text-orange-600/30 light:border-orange-500/10",
] as const;

const ROWS = [
  ["react", "express", "lodash", "axios", "next", "typescript", "webpack", "vue", "zod", "prisma", "eslint", "prettier", "vite", "tailwindcss", "jest"],
  ["svelte", "hono", "fastify", "drizzle-orm", "socket.io", "mongoose", "redis", "sharp", "puppeteer", "commander", "chalk", "dayjs", "uuid", "semver", "cors"],
  ["electron", "stripe", "firebase", "pg", "winston", "debug", "glob", "cheerio", "bcrypt", "nodemailer", "multer", "helmet", "morgan", "dotenv", "pino"],
];

function MarqueeRow({
  packages,
  duration,
  reverse,
  colorOffset,
}: {
  packages: string[];
  duration: number;
  reverse?: boolean;
  colorOffset: number;
}) {
  const doubled = [...packages, ...packages];

  return (
    <div className="flex overflow-hidden">
      <div
        className={reverse ? "animate-marquee-reverse" : "animate-marquee"}
        style={{ animationDuration: `${duration}s` }}
      >
        <div className="flex gap-3 pr-3">
          {doubled.map((pkg, i) => (
            <span
              key={`${pkg}-${i}`}
              className={`shrink-0 font-mono text-[11.5px] px-2.5 py-1.5 rounded border whitespace-nowrap ${COLORS[(i + colorOffset) % COLORS.length]}`}
            >
              {pkg}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScrollingPackages() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-2.5 pointer-events-none select-none overflow-hidden">
      {ROWS.map((row, i) => (
        <MarqueeRow
          key={i}
          packages={row}
          duration={45 + i * 10}
          reverse={i % 2 === 1}
          colorOffset={i * 3}
        />
      ))}

      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse 38% 100% at 50% 50%,
              var(--color-background) 0%,
              var(--color-background) 50%,
              transparent 100%
            )
          `,
        }}
      />
    </div>
  );
}
