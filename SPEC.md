# Product Specification: Data Center Site Selection Evaluator

## 1. Product Goal

The Data Center Site Selection Evaluator is a geographic decision-support tool for industry professionals—developers, energy analysts, and site-selection consultants—who evaluate land parcels for data center development.

The core problem is well known in the industry: **land is cheap; power is gold.** Inexpensive acreage is abundant. What is scarce is grid access: available capacity, interconnection queue position, transmission proximity, and the economic risk of locating in a constrained utility zone. This product exists to make those constraints visible on a map and comparable in a calculator, so users can screen parcels before they spend on studies, options, or land acquisition.

Users should be able to:

- Locate and inspect raw land parcels in a geographic context.
- Understand how far a parcel sits from high-voltage transmission infrastructure.
- Later, overlay energy-market and interconnection signals that affect project viability.
- Later, compare interconnection-dependent utility ramps against on-site generation strategies.

The product is **not** a full interconnection study, a power-purchase agreement model, or a land-title system. It is a screening and evaluation layer that sits upstream of those workflows.

## 2. Tech Stack

| Layer | Choice | Role |
| --- | --- | --- |
| Framework | Next.js | App routing, pages, and server/client boundaries |
| Language | TypeScript | Typed domain models, map data, and UI |
| Styling | Tailwind CSS | Layout, spacing, and visual system |
| Maps | MapLibre GL JS | Interactive vector map, layers, and geospatial overlays |

Implementation constraints:

- Prefer typed domain models for parcels, transmission features, and evaluation metrics.
- Keep map logic (MapLibre) isolated from product UI (sidebars, calculators, legends).
- Do not introduce additional major dependencies unless a phase explicitly requires them.

## 3. Domain Logic & Future Features

Work is sequenced in three phases. Each phase has a distinct user outcome. Later phases depend on earlier map and parcel primitives.

### Phase 1 — Parcels and transmission distance

**Outcome:** An interactive map that shows raw land parcels and their distance to high-voltage transmission lines.

This phase addresses the primary screening constraint: a cheap parcel that is far from transmission is often uneconomic because interconnection and last-mile infrastructure dominate cost and schedule.

Scope:

- Render an interactive MapLibre map as the primary workspace.
- Display raw land parcels as map features (polygons or equivalent).
- Display high-voltage transmission lines as a distinct layer.
- Compute and surface distance from a selected parcel to nearby transmission.
- Allow basic parcel selection and inspection (identity, location, distance-to-line).

Out of scope for Phase 1:

- Energy pricing overlays.
- Interconnection queue data products.
- Financial comparison of FTM vs. BYOP.

### Phase 2 — LMP congestion heatmap

**Outcome:** A Locational Marginal Pricing (LMP) congestion heatmap that visualizes **basis risk** in net-importing utility zones.

Basis risk here means the spread between a hub or reference price and the local node: congestion and loss components that can make a site structurally more expensive (or less bankable) even when nameplate power looks available.

Scope:

- Overlay LMP / congestion signal as a heatmap or choropleth on the map.
- Highlight net-importing utility zones where congestion is structurally adverse.
- Allow users to inspect a location’s congestion context alongside Phase 1 parcel geometry.

Out of scope for Phase 2:

- Full nodal market simulation.
- The FTM vs. BYOP calculator (Phase 3).

### Phase 3 — FTM vs. BYOP sidebar calculator

**Outcome:** A sidebar calculator that compares **Front-of-the-Meter (FTM)** utility phased ramps against **Bring Your Own Power (BYOP)** natural gas microgrid deployments.

FTM assumes the project takes utility power over a phased interconnection ramp (queue, studies, and stepped MW availability). BYOP assumes on-site generation (natural gas microgrid) to serve load when the grid cannot, or will not, deliver the required schedule.

Scope:

- Sidebar UI bound to a selected parcel / site context.
- Compare phased utility ramp (MW over time, implied wait/constraint) vs. BYOP microgrid deployment.
- Surface the tradeoff in a form useful for screening (timing, capacity path, high-level cost or constraint narrative—exact formulas to be specified when Phase 3 is authorized).

Out of scope for Phase 3 unless later specified:

- Full EPC cost engineering.
- Environmental permitting for generation.
- Real-time dispatch optimization.

## 4. AI Coding Rules

These rules apply to all implementation work on this product:

1. **Never write the entire application at once.** Deliver one feature (or one coherent slice of a phase) at a time.
2. **Build feature by feature.** Complete, review, and stabilize a slice before expanding scope.
3. **Always ask for permission before moving to the next phase.** Do not start Phase 2 work until Phase 1 is explicitly approved as complete. Do not start Phase 3 until Phase 2 is explicitly approved. Intra-phase features should also be sequenced; do not jump ahead without confirmation.
4. Stay within the current phase’s in-scope items. Do not pre-build APIs, UI, or data layers “for later” unless they are required for the current feature.
5. Prefer small, reviewable diffs that a user can run and inspect on the map (or calculator) before requesting the next increment.

## 5. Success Criteria (by phase)

- **Phase 1:** A professional can select a parcel and immediately see how far it is from high-voltage transmission.
- **Phase 2:** A professional can see whether a candidate location sits in a congested, net-importing zone and reason about basis risk.
- **Phase 3:** A professional can compare a utility FTM ramp path with a BYOP gas microgrid path for the same site without leaving the map workspace.

## 6. Non-goals

- Replacing utility interconnection studies or ISO/RTO official queue tools.
- Serving as a cadastral / legal land records system of record.
- Automated site acquisition or offer generation.
- Building all three phases in a single implementation pass.
