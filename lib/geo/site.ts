import type { Position } from "@/lib/data/hifld";
import type {
  GasPipelineFeature,
  QueueData,
  SubstationFeature,
} from "@/lib/data/sites";
import { nearestOnLines, nearestPoint, sumWithin, type NearestHit } from "./nearest.ts";

/** One loaded-or-not dataset result: `null` data means it hasn't loaded (or failed). */
export type Lookup<T> = { status: "loading" } | { status: "unavailable" } | { status: "ready"; value: T };

export interface SubstationHit {
  name: string | null;
  kv: number;
  lines: number | null;
  distanceMiles: number;
  position: Position;
  /** Beyond the loaded-data margin, so a closer one may exist. */
  uncertain: boolean;
}

export interface PipelineHit {
  operator: string | null;
  distanceMiles: number;
  closestPoint: Position;
  uncertain: boolean;
}

export interface QueueBacklog {
  /** Active queued generation within `radiusMiles`, MW. */
  mw: number;
  projects: number;
  counties: number;
  radiusMiles: number;
  heavy: boolean;
  heavyMw: number;
}

export interface SiteContext {
  substation: Lookup<SubstationHit | null>;
  pipeline: Lookup<PipelineHit | null>;
  backlog: Lookup<QueueBacklog>;
}

export interface SiteData {
  substations: SubstationFeature[] | null;
  pipelines: GasPipelineFeature[] | null;
  queue: QueueData | null;
  /** Which datasets failed to load. */
  failed: { substations?: boolean; pipelines?: boolean; queue?: boolean };
}

function lookup<T, R>(data: T | null, failed: boolean | undefined, run: (d: T) => R): Lookup<R> {
  if (data) return { status: "ready", value: run(data) };
  return { status: failed ? "unavailable" : "loading" };
}

function pipelineParts(feature: GasPipelineFeature): Position[][] {
  const g = feature.geometry;
  if (!g) return [];
  return g.type === "LineString" ? [g.coordinates] : g.coordinates;
}

/**
 * Substation, pipeline, and queue context for a pin. `coverageMarginMiles` is
 * the same loaded-data margin as the line distances use.
 */
export function analyzeSite(
  point: Position,
  coverageMarginMiles: number,
  data: SiteData,
): SiteContext {
  const substation = lookup(data.substations, data.failed.substations, (features) => {
    const hit: NearestHit<SubstationFeature> | null = nearestPoint(
      point,
      features,
      (f) => f.geometry.coordinates,
    );
    return hit
      ? {
          name: hit.item.properties.name,
          kv: hit.item.properties.kv,
          lines: hit.item.properties.lines,
          distanceMiles: hit.distanceMiles,
          position: hit.closestPoint,
          uncertain: hit.distanceMiles > coverageMarginMiles,
        }
      : null;
  });

  const pipeline = lookup(data.pipelines, data.failed.pipelines, (features) => {
    const hit = nearestOnLines(point, features, pipelineParts);
    return hit
      ? {
          operator: hit.item.properties.operator,
          distanceMiles: hit.distanceMiles,
          closestPoint: hit.closestPoint,
          uncertain: hit.distanceMiles > coverageMarginMiles,
        }
      : null;
  });

  const backlog = lookup(data.queue, data.failed.queue, (queue) => {
    const { radiusMiles, heavyMw } = queue.meta;
    let projects = 0;
    const { total, count } = sumWithin(
      point,
      queue.counties,
      (c) => c.position,
      (c) => {
        projects += c.projects;
        return c.mw;
      },
      radiusMiles,
    );
    return {
      mw: Math.round(total),
      projects,
      counties: count,
      radiusMiles,
      heavy: total >= heavyMw,
      heavyMw,
    };
  });

  return { substation, pipeline, backlog };
}
