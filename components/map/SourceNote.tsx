"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** A small information icon. The note sits in a popover so the label stays short. */
export default function SourceNote({
  children,
  label = "Source",
  placement = "up",
}: {
  children: ReactNode;
  label?: string;
  /** Legends sit on the bottom edge, so the note opens upward. */
  placement?: "up" | "down";
}) {
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
    <div ref={rootRef} className={placement === "down" ? undefined : "relative"}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/15 text-[10px] leading-none font-medium text-zinc-400 hover:border-white/30 hover:text-zinc-200"
      >
        i
      </button>
      {open && (
        <div
          id={panelId}
          role="note"
          className={`absolute z-20 rounded-lg border border-white/10 bg-zinc-950/95 px-2.5 py-2 leading-snug text-zinc-300 shadow-lg shadow-black/50 ${
            placement === "down"
              ? "top-full right-0 left-0 mt-1 text-[10px]"
              : "right-0 bottom-full mb-1.5 w-52 text-[10px]"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
