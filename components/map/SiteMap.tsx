"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import TransmissionLegend from "@/components/map/TransmissionLegend";
import { fetchTransmissionLines } from "@/lib/data/hifld";
import {
  DARK_BASEMAP_STYLE,
  MAPLIBRE_WORKER_URL,
  MISO_PJM_CENTER,
  MISO_PJM_DEFAULT_ZOOM,
} from "@/lib/map/region";
import {
  addTransmissionLayer,
  TRANSMISSION_SOURCE,
} from "@/lib/map/transmission";

type LoadStatus = "loading" | "ready" | "error";

export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const abort = new AbortController();

    // Must run before the first map is created. Serve the worker from our own
    // origin (copied into /public by scripts/copy-maplibre-worker.mjs) because
    // Turbopack breaks maplibre's default import.meta.url-based lookup.
    setWorkerUrl(MAPLIBRE_WORKER_URL);

    const map = new MapLibreMap({
      container,
      style: DARK_BASEMAP_STYLE,
      center: MISO_PJM_CENTER,
      zoom: MISO_PJM_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error);
      if (!map.isStyleLoaded()) {
        setStatus("error");
        setError("Basemap style failed to load. Check your network connection.");
      }
    });

    map.once("load", () => {
      addTransmissionLayer(map);

      fetchTransmissionLines(abort.signal)
        .then((lines) => {
          const source = map.getSource<GeoJSONSource>(TRANSMISSION_SOURCE);
          source?.setData(lines as Parameters<GeoJSONSource["setData"]>[0]);
          setStatus("ready");
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted) {
            return;
          }
          console.error(err);
          setStatus("error");
          setError(
            err instanceof Error ? err.message : "Failed to load transmission data.",
          );
        });
    });

    return () => {
      abort.abort();
      map.remove();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-screen w-screen" />
      <TransmissionLegend />

      {status === "loading" && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-300">
          Loading transmission lines…
        </div>
      )}
      {status === "error" && error && (
        <div className="absolute bottom-4 left-1/2 z-10 max-w-sm -translate-x-1/2 rounded-lg border border-red-500/40 bg-zinc-950/90 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
