"use client";

const ROWS = [
  ["react", "express", "lodash", "axios", "next", "typescript", "webpack", "vue", "zod", "prisma", "eslint", "prettier", "vite", "tailwindcss", "jest"],
  ["svelte", "hono", "fastify", "drizzle-orm", "socket.io", "mongoose", "redis", "sharp", "puppeteer", "commander", "chalk", "dayjs", "uuid", "semver", "cors"],
  ["electron", "stripe", "firebase", "pg", "winston", "debug", "glob", "cheerio", "bcrypt", "nodemailer", "multer", "helmet", "morgan", "dotenv", "pino"],
];

function MarqueeRow({
  packages,
  duration,
  reverse,
}: {
  packages: string[];
  duration: number;
  reverse?: boolean;
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
              className="shrink-0 font-mono text-[11px] px-2.5 py-1.5 rounded border border-foreground/[0.05] light:border-foreground/[0.07] text-foreground/[0.12] light:text-foreground/[0.09] whitespace-nowrap"
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
