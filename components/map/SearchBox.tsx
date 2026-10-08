"use client";

import { useRef, useState } from "react";
import { searchPlace, type LngLat } from "@/lib/geo/search";

interface SearchBoxProps {
  onResult: (point: LngLat) => void;
}

export default function SearchBox({ onResult }: SearchBoxProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = text.trim();
    if (!query) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setBusy(true);
    setMessage(null);
    try {
      const hit = await searchPlace(query, abort.signal);
      if (!hit) {
        setMessage("No match. Try a city and state, or lat, lng.");
      } else {
        onResult(hit.point);
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setMessage(error instanceof Error ? error.message : "Search failed.");
      }
    } finally {
      if (abortRef.current === abort) setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} role="search" className="pointer-events-auto">
      <label className="sr-only" htmlFor="map-search">
        Search a place or coordinates
      </label>
      <input
        id="map-search"
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={busy ? "Searching…" : "Place or lat, lng"}
        className="w-52 rounded-xl border border-white/10 bg-zinc-950/85 px-3 py-2 text-xs text-zinc-50 shadow-lg shadow-black/40 backdrop-blur-md outline-none placeholder:text-zinc-500 focus:border-cyan-400/60"
      />
      {message && (
        <p className="mt-1 w-52 rounded-md bg-zinc-950/85 px-2 py-1 text-[11px] text-amber-300">
          {message}
        </p>
      )}
    </form>
  );
}
