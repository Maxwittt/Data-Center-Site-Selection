"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CONGESTION_METRICS,
  formatPeriod,
  type CongestionMeta,
  type CongestionMetric,
} from "@/lib/map/congestion";

interface LayersCardProps {
  showLines: boolean;
  onShowLinesChange: (value: boolean) => void;
  showZones: boolean;
  onShowZonesChange: (value: boolean) => void;
  metric: CongestionMetric;
  onMetricChange: (value: CongestionMetric) => void;
  /** Null until the congestion data has loaded. */
  meta: CongestionMeta | null;
  showSubstations: boolean;
  onShowSubstationsChange: (value: boolean) => void;
  showGas: boolean;
  onShowGasChange: (value: boolean) => void;
  /** When each loaded dataset was built, for the "Data built" list. */
  dataDates: { label: string; date: string }[];
}

export default function LayersCard({
  showLines,
  onShowLinesChange,
  showSubstations,
  onShowSubstationsChange,
  showGas,
  onShowGasChange,
  showZones,
  onShowZonesChange,
  metric,
  onMetricChange,
  meta,
  dataDates,
}: LayersCardProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950/85 px-3 py-2 text-xs font-semibold tracking-tight text-zinc-50 shadow-lg shadow-black/40 backdrop-blur-md"
      >
        Map Options
        <Chevron open={open} />
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Map options"
          className="mt-2 w-56 rounded-xl border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md"
        >
          <div className="space-y-2">
            <LayerToggle
              checked={showLines}
              onChange={onShowLinesChange}
              label="Transmission lines"
            />
            <LayerToggle
              checked={showSubstations}
              onChange={onShowSubstationsChange}
              label="Substations (230 kV+)"
            />
            <LayerToggle
              checked={showGas}
              onChange={onShowGasChange}
              label="Interstate gas pipelines"
            />
            <LayerToggle
              checked={showZones}
              disabled={!meta}
              onChange={onShowZonesChange}
              label="Utility territories"
            />
          </div>

          {showZones && meta && (
            <fieldset className="mt-3 border-t border-white/10 pt-2.5">
              <legend className="sr-only">How to color congestion</legend>
              <div
                role="radiogroup"
                aria-label="How to color congestion"
                className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-0.5"
              >
                {CONGESTION_METRICS.map((option) => {
                  const active = option.id === metric;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onMetricChange(option.id)}
                      className={`rounded-md px-1.5 py-1 text-[11px] leading-tight transition-colors ${
                        active
                          ? "bg-white/15 font-medium text-zinc-50"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                Day-ahead, {meta.dayCount}-day average
                <br />
                {formatPeriod(meta)}
              </p>
            </fieldset>
          )}

          {dataDates.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-2.5">
              <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                Data built
              </p>
              <dl className="mt-1 space-y-0.5 text-[10px] text-zinc-400">
                {dataDates.map((item) => (
                  <div key={item.label} className="flex justify-between gap-2">
                    <dt>{item.label}</dt>
                    <dd className="text-zinc-300">{formatBuildDate(item.date)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatBuildDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function LayerToggle({
  checked,
  disabled = false,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-xs ${
        disabled ? "text-zinc-600" : "cursor-pointer text-zinc-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-cyan-400"
      />
      {label}
    </label>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
