"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export function FeatureHint({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  const [visible, setVisible] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const reposition = useCallback(() => {
    if (!tipRef.current) return;
    const el = tipRef.current;
    el.style.left = "50%";
    el.style.transform = `translateX(-50%) translateY(${visible ? "0" : "4px"})`;
    const rect = el.getBoundingClientRect();
    if (rect.left < 8) {
      el.style.left = `${-rect.left + 8}px`;
      el.style.transform = `translateX(0) translateY(${visible ? "0" : "4px"})`;
    } else if (rect.right > window.innerWidth - 8) {
      el.style.left = `${window.innerWidth - rect.right - 8}px`;
      el.style.transform = `translateX(0) translateY(${visible ? "0" : "4px"})`;
    }
  }, [visible]);

  useEffect(() => {
    reposition();
  }, [visible, reposition]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="text-foreground/70 light:text-foreground/80 border-b border-dashed border-foreground/20 light:border-foreground/30 cursor-default pb-px">
        {label}
      </span>
      <span
        ref={tipRef}
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateX(-50%) translateY(${visible ? "0" : "4px"})`,
          pointerEvents: visible ? "auto" : "none",
          transitionProperty: "opacity, transform",
          transitionDuration: "200ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className="absolute bottom-full left-1/2 mb-2.5 px-3.5 py-2.5 text-[12px] text-foreground/70 light:text-foreground/80 bg-background border border-foreground/[0.08] light:border-foreground/12 rounded-md shadow-md whitespace-normal text-center w-56 leading-relaxed z-50"
      >
        {tip}
      </span>
    </span>
  );
}
