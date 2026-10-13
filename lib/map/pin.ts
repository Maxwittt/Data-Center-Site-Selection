import { Marker, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { Position } from "@/lib/data/hifld";

const CONNECTOR_SOURCE = "pin-connector";
const CONNECTOR_LAYER = "pin-connector-layer";

/** Adds an empty source/layer for the pin → nearest-line connector. */
export function addPinConnectorLayer(map: MapLibreMap) {
  map.addSource(CONNECTOR_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: CONNECTOR_LAYER,
    type: "line",
    source: CONNECTOR_SOURCE,
    layout: { "line-cap": "round" },
    paint: {
      "line-color": "#f4f4f5",
      "line-width": 1.5,
      "line-opacity": 0.9,
      "line-dasharray": [2, 2],
    },
  });
}

/** Draws a dashed line from the pin to a point on the nearest line, or clears it. */
export function setPinConnector(
  map: MapLibreMap,
  from: Position,
  to: Position | null,
) {
  const source = map.getSource<GeoJSONSource>(CONNECTOR_SOURCE);
  source?.setData({
    type: "FeatureCollection",
    features: to
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [from, to] },
          },
        ]
      : [],
  });
}

export function clearPinConnector(map: MapLibreMap) {
  map.getSource<GeoJSONSource>(CONNECTOR_SOURCE)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

/** Class on the marker element, used to ignore map clicks that land on the pin. */
export const PIN_MARKER_CLASS = "site-pin-marker";

/** A draggable pin marker. Add it to a map with `.setLngLat(...).addTo(map)`. */
export function createPinMarker(): Marker {
  const element = document.createElement("div");
  element.className = PIN_MARKER_CLASS;
  element.style.cssText = [
    "width:18px",
    "height:18px",
    "border-radius:9999px",
    "background:#22d3ee",
    "border:3px solid #ffffff",
    "box-shadow:0 0 0 2px rgba(9,9,11,0.6),0 0 14px 2px rgba(34,211,238,0.7)",
    "cursor:grab",
  ].join(";");

  return new Marker({ element, draggable: true });
}

/** A small lettered marker for a site saved to the comparison. */
export function createSiteMarker(label: string, onClick: () => void): Marker {
  const element = document.createElement("button");
  element.type = "button";
  element.className = PIN_MARKER_CLASS;
  element.textContent = label;
  element.setAttribute("aria-label", `Saved site ${label}`);
  element.style.cssText = [
    "width:20px",
    "height:20px",
    "border-radius:9999px",
    "background:#09090b",
    "color:#22d3ee",
    "border:2px solid #22d3ee",
    "font:700 11px/16px system-ui,sans-serif",
    "text-align:center",
    "cursor:pointer",
    "padding:0",
  ].join(";");
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return new Marker({ element });
}

/** Pin card is `right-4 w-80`; keep a little air so the pin is not flush against it. */
export const PIN_CARD_RIGHT_PX = 16 + 320 + 24;

const EDGE_PAD = 32;
const MIN_OPEN_WIDTH = 220;

export function pinCardPadding(width: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  return {
    top: 16,
    right: Math.min(PIN_CARD_RIGHT_PX, Math.max(0, width - MIN_OPEN_WIDTH)),
    bottom: 16,
    left: 16,
  };
}

/** True when the pin would sit under the card or off the remaining map. */
export function pinNeedsReveal(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): boolean {
  const { right, left, top, bottom } = pinCardPadding(width);
  return (
    screenX < left + EDGE_PAD ||
    screenX > width - right - EDGE_PAD ||
    screenY < top + EDGE_PAD ||
    screenY > height - bottom - EDGE_PAD
  );
}

/**
 * If the pin is under the card, slide the view so it sits in the open map.
 * Zoom stays put; only the camera center moves.
 */
export function revealPin(map: MapLibreMap, point: Position) {
  const { width, height } = map.getContainer().getBoundingClientRect();
  const screen = map.project(point);
  if (!pinNeedsReveal(screen.x, screen.y, width, height)) return;
  map.easeTo({
    center: point,
    padding: pinCardPadding(width),
    duration: 400,
  });
}

export function clearPinPadding(map: MapLibreMap) {
  map.easeTo({
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    duration: 250,
  });
}
