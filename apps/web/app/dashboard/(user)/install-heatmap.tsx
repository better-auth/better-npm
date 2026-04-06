"use client";

import { useState, useMemo } from "react";

interface HeatmapDay {
  date: string;
  count: number;
  packages: { name: string; count: number }[];
}

interface InstallHeatmapProps {
  days: HeatmapDay[];
}

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const WEEKS = 26;
const ROWS = 7;
const LABEL_W = 28;
const HEADER_H = 16;

function intensity(count: number, max: number): number {
  if (count === 0) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

const FILLS = [
  "rgba(255,255,255,0.04)",
  "rgba(0,255,242,0.2)",
  "rgba(0,255,242,0.38)",
  "rgba(0,255,242,0.58)",
  "rgba(0,255,242,0.85)",
];

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function InstallHeatmap({ days }: InstallHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    day: HeatmapDay & { dateStr: string };
  } | null>(null);

  const { grid, months, maxCount } = useMemo(() => {
    const countMap = new Map<string, HeatmapDay>();
    for (const d of days) countMap.set(d.date, d);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const todayDow = today.getUTCDay();
    const endOfWeek = new Date(today);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + (6 - todayDow));

    const startDate = new Date(endOfWeek);
    startDate.setUTCDate(startDate.getUTCDate() - WEEKS * 7 + 1);

    let max = 0;
    const cells: {
      date: string;
      count: number;
      packages: { name: string; count: number }[];
      col: number;
      row: number;
      future: boolean;
    }[] = [];

    const monthLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;

    const cursor = new Date(startDate);
    for (let week = 0; week < WEEKS; week++) {
      for (let dow = 0; dow < 7; dow++) {
        const iso = cursor.toISOString().split("T")[0];
        const entry = countMap.get(iso);
        const count = entry?.count ?? 0;
        const isFuture = cursor > today;

        if (!isFuture && count > max) max = count;

        const m = cursor.getUTCMonth();
        if (m !== lastMonth) {
          monthLabels.push({
            label: cursor.toLocaleDateString("en-US", {
              month: "short",
              timeZone: "UTC",
            }),
            col: week,
          });
          lastMonth = m;
        }

        cells.push({
          date: iso,
          count,
          packages: entry?.packages ?? [],
          col: week,
          row: dow,
          future: isFuture,
        });

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    return { grid: cells, months: monthLabels, maxCount: max };
  }, [days]);

  const svgW = LABEL_W + WEEKS * STEP;
  const svgH = HEADER_H + ROWS * STEP;

  return (
    <div className="relative">
      <div className="rounded border border-foreground/[0.08] overflow-clip">
        <div className="border-b border-foreground/[0.06] bg-foreground/[0.02] px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Install activity</h3>
          <div className="flex items-center gap-2 text-[10px] font-mono text-foreground/30">
            <span>Less</span>
            <div className="flex gap-[3px]">
              {FILLS.map((fill, i) => (
                <div
                  key={i}
                  className="w-[10px] h-[10px] rounded-[2px]"
                  style={{ background: fill }}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>

        <div className="px-5 py-4 overflow-x-auto thin-scrollbar">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={svgW}
          height={svgH}
          className="block"
        >
          {months.map((m, i) => (
            <text
              key={i}
              x={LABEL_W + m.col * STEP}
              y={10}
              className="fill-foreground/25"
              fontSize={9}
              fontFamily="var(--font-mono)"
            >
              {m.label}
            </text>
          ))}

          {DAY_LABELS.map(
            (label, i) =>
              label && (
                <text
                  key={i}
                  x={0}
                  y={HEADER_H + i * STEP + CELL - 1}
                  className="fill-foreground/20"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              ),
          )}

          {grid.map((cell, i) => (
            <rect
              key={i}
              x={LABEL_W + cell.col * STEP}
              y={HEADER_H + cell.row * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              fill={
                cell.future
                  ? "transparent"
                  : FILLS[intensity(cell.count, maxCount)]
              }
              stroke={
                cell.future
                  ? "rgba(255,255,255,0.02)"
                  : "rgba(255,255,255,0.03)"
              }
              strokeWidth={0.5}
              className="transition-colors duration-150"
              style={{ cursor: cell.future ? "default" : "pointer" }}
              onMouseEnter={(e) => {
                if (cell.future) return;
                const rect = (
                  e.target as SVGRectElement
                ).getBoundingClientRect();
                const container = (
                  e.target as SVGRectElement
                ).closest(".relative")!;
                const cRect = container.getBoundingClientRect();
                setTooltip({
                  x: rect.left - cRect.left + rect.width / 2,
                  y: rect.top - cRect.top - 8,
                  day: { ...cell, dateStr: formatDate(cell.date) },
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        </div>
      </div>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="bg-foreground/95 text-background rounded px-2.5 py-1.5 text-[11px] font-mono whitespace-nowrap shadow-lg">
            <div className="font-medium">
              {tooltip.day.count === 0
                ? "No installs"
                : `${tooltip.day.count} install${tooltip.day.count !== 1 ? "s" : ""}`}
            </div>
            <div className="text-background/60 mt-0.5">
              {tooltip.day.dateStr}
            </div>
            {tooltip.day.packages.length > 0 && (
              <div className="mt-1 pt-1 border-t border-background/15 space-y-px">
                {tooltip.day.packages.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-background/50 truncate max-w-[120px]">
                      {p.name}
                    </span>
                    <span className="text-background/30">×{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="w-2 h-2 bg-foreground/95 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}
