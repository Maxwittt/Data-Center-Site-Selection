import type { LineHit } from "../geo/proximity.ts";
import type { SiteContext } from "../geo/site.ts";
import { defaultRamp, type RampInputs, type ScreeningDefaults } from "./interconnection.ts";

export type ConnectionBasis =
  | { kind: "substation"; kv: number; distanceMiles: number; name: string | null }
  | { kind: "line"; kv: number; distanceMiles: number }
  | { kind: "none" };

export interface SiteScreening {
  defaults: ScreeningDefaults;
  basis: ConnectionBasis;
  /** Pipeline distance used, or null when none is loaded, or undefined when unknown. */
  pipelineMiles: number | null | undefined;
  heavyBacklog: boolean;
}

/**
 * Screening defaults for a pin: connect at whichever is faster, the nearest
 * 230 kV+ substation or a new switching station on the nearest line.
 */
export function screenSite(nearest: LineHit | null, site: SiteContext): SiteScreening {
  const pipelineMiles =
    site.pipeline.status === "ready" ? (site.pipeline.value?.distanceMiles ?? null) : undefined;
  const heavyBacklog = site.backlog.status === "ready" && site.backlog.value.heavy;
  const shared: Omit<RampInputs, "connection"> = { pipelineMiles, heavyBacklog };

  const substation = site.substation.status === "ready" ? site.substation.value : null;
  const candidates: { defaults: ScreeningDefaults; basis: ConnectionBasis }[] = [];
  if (substation) {
    candidates.push({
      defaults: defaultRamp({
        ...shared,
        connection: { kv: substation.kv, distanceMiles: substation.distanceMiles },
      }),
      basis: {
        kind: "substation",
        kv: substation.kv,
        distanceMiles: substation.distanceMiles,
        name: substation.name,
      },
    });
  }
  if (nearest) {
    candidates.push({
      defaults: defaultRamp({
        ...shared,
        connection: { kv: nearest.kv, distanceMiles: nearest.distanceMiles, newStation: true },
      }),
      basis: { kind: "line", kv: nearest.kv, distanceMiles: nearest.distanceMiles },
    });
  }
  const best = candidates.reduce<(typeof candidates)[number] | null>(
    (a, b) => (a && a.defaults.ftmFullYears <= b.defaults.ftmFullYears ? a : b),
    null,
  ) ?? { defaults: defaultRamp({ ...shared, connection: null }), basis: { kind: "none" } };

  return { ...best, pipelineMiles, heavyBacklog };
}
