"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import CongestionLegend from "@/components/map/CongestionLegend";
import type { ZoneContext } from "@/components/map/CongestionSection";
import LayersCard from "@/components/map/LayersCard";
import PinCard from "@/components/map/PinCard";
import TransmissionLegend from "@/components/map/TransmissionLegend";
import ZoneTooltip from "@/components/map/ZoneTooltip";
import {
  fetchTransmissionLines,
  type Position,
  type TransmissionLineFeature,
} from "@/lib/data/hifld";
import { createCoverage, type Coverage } from "@/lib/geo/coverage";
import { findZonesAt } from "@/lib/geo/pointInPolygon";
import { analyzePin, type PinAnalysis } from "@/lib/geo/proximity";
import {
  addCongestionLayers,
  CONGESTION_FILL_LAYER,
  fetchCongestion,
  setCongestionHover,
  setCongestionMetric,
  setCongestionVisible,
  type CongestionCollection,
  type CongestionMetric,
  type CongestionProperties,
} from "@/lib/map/congestion";
import {
  DARK_BASEMAP_STYLE,
  MAPLIBRE_WORKER_URL,
  MISO_CENTER,
  MISO_DEFAULT_ZOOM,
} from "@/lib/map/region";
import {
  addPinConnectorLayer,
  clearPinConnector,
  createPinMarker,
  PIN_MARKER_CLASS,
  setPinConnector,
} from "@/lib/map/pin";
import {
  addTransmissionLayer,
  TRANSMISSION_CASING_LAYER,
  TRANSMISSION_LAYER,
  TRANSMISSION_SOURCE,
} from "@/lib/map/transmission";

type LoadStatus = "loading" | "ready" | "error";

interface HoverState {
  x: number;
  y: number;
  zone: CongestionProperties;
}

const DEFAULT_METRIC: CongestionMetric = "avgMcc";

export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PinAnalysis | null>(null);

  // Congestion layer state. `congestion` is null until the data has loaded and
  // its layers exist on the map.
  const [congestion, setCongestion] = useState<CongestionCollection | null>(null);
  const congestionMeta = congestion?.meta ?? null;
  const [congestionError, setCongestionError] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [metric, setMetric] = useState<CongestionMetric>(DEFAULT_METRIC);
  const [hover, setHover] = useState<HoverState | null>(null);

  // The effect below owns the map; these let UI handlers and other effects
  // reach into it.
  const mapRef = useRef<MapLibreMap | null>(null);
  const metricRef = useRef(metric);
  const setPinRef = useRef<(point: Position | null) => void>(() => {});

  useEffect(() => {
    metricRef.current = metric;
  }, [metric]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const abort = new AbortController();
    let lines: TransmissionLineFeature[] | null = null;
    let coverage: Coverage | null = null;
    let marker: Marker | null = null;

    // Must run before the first map is created. Serve the worker from our own
    // origin (copied into /public by scripts/copy-maplibre-worker.mjs) because
    // Turbopack breaks maplibre's default import.meta.url-based lookup.
    setWorkerUrl(MAPLIBRE_WORKER_URL);

    const map = new MapLibreMap({
      container,
      style: DARK_BASEMAP_STYLE,
      center: MISO_CENTER,
      zoom: MISO_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    /** Drops (or moves) the pin and recomputes; `null` removes it. */
    function setPin(point: Position | null) {
      if (!point) {
        marker?.remove();
        marker = null;
        clearPinConnector(map);
        setAnalysis(null);
        return;
      }
      if (!lines || !coverage) {
        return;
      }

      const result = analyzePin(point, lines, coverage);
      setAnalysis(result);
      setPinConnector(map, point, result.nearest?.closestPoint ?? null);

      if (!marker) {
        marker = createPinMarker();
        marker.on("dragend", () => {
          const { lng, lat } = marker!.getLngLat();
          setPin([lng, lat]);
        });
        marker.setLngLat(point).addTo(map);
      } else {
        marker.setLngLat(point);
      }
    }
    setPinRef.current = setPin;

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error);
      if (!map.isStyleLoaded()) {
        setStatus("error");
        setError("Basemap style failed to load. Check your network connection.");
      }
    });

    map.on("click", (event) => {
      const target = event.originalEvent.target as Element | null;
      // Clicking the pin itself shouldn't relocate it.
      if (target?.closest(`.${PIN_MARKER_CLASS}`)) {
        return;
      }
      setPin([event.lngLat.lng, event.lngLat.lat]);
    });

    // Zone hover: highlight the territory and show its numbers. When territories
    // overlap, the topmost (smallest) one is returned first.
    // Look the typed record up in the collection we loaded (keyed by territory,
    // which is unique) rather than trusting rendered-feature property types.
    const zonesByTerritory = new Map<string, CongestionProperties>();
    let hoveredName: string | null = null;
    map.on("mousemove", (event) => {
      if (!map.getLayer(CONGESTION_FILL_LAYER)) {
        return;
      }
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [CONGESTION_FILL_LAYER],
      })[0];
      if (!feature) {
        if (hoveredName !== null) {
          hoveredName = null;
          setCongestionHover(map, null);
          setHover(null);
        }
        return;
      }
      const zone = zonesByTerritory.get(String(feature.properties.territory));
      if (!zone) {
        return;
      }
      if (zone.name !== hoveredName) {
        hoveredName = zone.name;
        setCongestionHover(map, zone.name);
      }
      setHover({ x: event.point.x, y: event.point.y, zone });
    });
    map.on("mouseout", () => {
      hoveredName = null;
      setCongestionHover(map, null);
      setHover(null);
    });

    map.once("load", () => {
      addTransmissionLayer(map);
      addPinConnectorLayer(map);

      // Congestion zones load independently: a failure here must not block the
      // transmission lines (or vice versa).
      fetchCongestion(abort.signal)
        .then((collection) => {
          for (const feature of collection.features) {
            zonesByTerritory.set(feature.properties.territory, feature.properties);
          }
          addCongestionLayers(map, collection, metricRef.current);
          setCongestion(collection);
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted) {
            return;
          }
          console.error(err);
          setCongestionError(
            err instanceof Error ? err.message : "Failed to load congestion data.",
          );
        });

      fetchTransmissionLines(abort.signal)
        .then((collection) => {
          lines = collection.features;
          coverage = createCoverage(collection.meta.coverage);
          const source = map.getSource<GeoJSONSource>(TRANSMISSION_SOURCE);
          source?.setData(collection as Parameters<GeoJSONSource["setData"]>[0]);
          map.getCanvas().style.cursor = "crosshair";
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
      setPinRef.current = () => {};
      marker?.remove();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Keep map layers in sync with the controls. Each guards against the layer
  // not existing yet; `congestionMeta` re-triggers them once it does.
  useEffect(() => {
    const map = mapRef.current;
    if (map && congestionMeta) {
      setCongestionMetric(map, metric, congestionMeta);
    }
  }, [metric, congestionMeta]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && congestionMeta) {
      setCongestionVisible(map, showZones);
      if (!showZones) {
        setCongestionHover(map, null);
      }
    }
  }, [showZones, congestionMeta]);

  useEffect(() => {
    const map = mapRef.current;
    for (const id of [TRANSMISSION_CASING_LAYER, TRANSMISSION_LAYER]) {
      if (map?.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showLines ? "visible" : "none");
      }
    }
  }, [showLines, status]);

  const zonesVisible = showZones && congestionMeta !== null;

  // Congestion at the pin. Derived, so a pin dropped before the data finishes
  // loading fills in by itself, and it still works with the layer toggled off.
  const zoneContext = useMemo<ZoneContext>(() => {
    if (!congestion) {
      return { status: congestionError ? "unavailable" : "loading" };
    }
    if (!analysis) {
      return { status: "outside" };
    }
    const hits = findZonesAt(analysis.point, congestion.features);
    if (hits.length === 0) {
      return { status: "outside" };
    }
    const [top, ...rest] = hits;
    const overlapping = [
      ...new Set(
        rest.map((hit) => hit.properties.name).filter((name) => name !== top.properties.name),
      ),
    ];
    return {
      status: "inside",
      zone: top.properties,
      overlapping,
      meta: congestion.meta,
    };
  }, [analysis, congestion, congestionError]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-screen w-screen" />

      <LayersCard
        showLines={showLines}
        onShowLinesChange={setShowLines}
        showZones={showZones}
        onShowZonesChange={setShowZones}
        metric={metric}
        onMetricChange={setMetric}
        meta={congestionMeta}
      />

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-3">
        {zonesVisible && <CongestionLegend metric={metric} meta={congestionMeta} />}
        {/* The pin card lists the same voltage tiers, so hide that legend then. */}
        {!analysis && showLines && <TransmissionLegend />}
      </div>

      {hover && zonesVisible && (
        <ZoneTooltip x={hover.x} y={hover.y} zone={hover.zone} />
      )}

      {analysis ? (
        <PinCard
          analysis={analysis}
          congestion={zoneContext}
          onClear={() => setPinRef.current(null)}
        />
      ) : (
        status === "ready" && (
          <div className="pointer-events-none absolute top-4 right-4 z-10 max-w-64 rounded-xl border border-white/10 bg-zinc-950/85 px-4 py-3 text-xs text-zinc-300 shadow-lg shadow-black/40 backdrop-blur-md">
            Click anywhere on the map to drop a pin and measure the distance to
            nearby transmission lines.
          </div>
        )
      )}

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
      {congestionError && (
        <div className="absolute bottom-16 left-1/2 z-10 max-w-sm -translate-x-1/2 rounded-lg border border-amber-500/40 bg-zinc-950/90 px-3 py-2 text-xs text-amber-300">
          Congestion layer unavailable: {congestionError}
        </div>
      )}
    </div>
  );
}
