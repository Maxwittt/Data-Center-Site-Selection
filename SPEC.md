# Product Specification: Data Center Site Selection Evaluator

## 1. Product Goal

The Data Center Site Selection Evaluator is a geographic decision-support tool for industry professionals—developers, energy analysts, and site-selection consultants—who evaluate land parcels for data center development.

The core problem is well known in the industry: **land is cheap; power is gold.** Inexpensive acreage is abundant. What is scarce is grid access: available capacity, interconnection queue position, transmission proximity, and the economic risk of locating in a constrained utility zone. This product exists to make those constraints visible on a map and comparable in a calculator, so users can screen sites before they spend on studies, options, or land acquisition.

Users should be able to:

- Drop a pin on any point in the MISO region to evaluate it as a candidate site. The product is scoped to MISO until it is done well there; other markets (such as PJM) are a later decision.
- Understand how far that point sits from high-voltage transmission infrastructure, and at what voltage.
- See the MISO congestion context of that point (utility zone, congestion cost, basis risk).
- Later, overlay interconnection signals that affect project viability.
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

- Prefer typed domain models for transmission features, pin analysis results, and evaluation metrics.
- Keep map logic (MapLibre) isolated from product UI (sidebars, calculators, legends).
- Do not introduce additional major dependencies unless a phase explicitly requires them.

## 3. Domain Logic & Future Features

Work is sequenced in three phases. Each phase has a distinct user outcome. Later phases depend on earlier map and pin primitives.

### Phase 1 — Transmission map and pin-drop distance

**Outcome:** An interactive map of real high-voltage transmission lines where the user can drop a pin on any point and see the distance and voltage of the nearest lines.

This phase addresses the primary screening constraint: a cheap site that is far from transmission is often uneconomic because interconnection and last-mile infrastructure dominate cost and schedule.

Scope:

- Render an interactive MapLibre map as the primary workspace.
- Display real high-voltage transmission lines (HIFLD, 138 kV and above) as a layer colored by voltage tier, with a legend. Coverage is **MISO only**: lines within 50 miles of MISO's footprint, built offline by `npm run build:transmission`. The buffer keeps distances honest for sites near the MISO border, where the nearest line may sit across it.
- Clicking the map drops a draggable pin at that point.
- For the pin, compute and show the nearest line overall (voltage, owner, distance) and the nearest line in each voltage tier, with a connector drawn to the nearest line.
- Flag results that may be incomplete when the pin is near or outside the edge of the loaded data area. The loaded area is irregular (MISO plus the buffer), so its edge is described by a coverage mask shipped with the data, not a bounding box.

Decided against: clickable land parcels. Any point is a candidate site, so no parcel dataset is required.

Out of scope for Phase 1:

- Energy pricing overlays.
- Interconnection queue data products.
- Financial comparison of FTM vs. BYOP.

### Phase 2 — MISO congestion map (zone choropleth)

**Outcome:** A Locational Marginal Pricing (LMP) congestion overlay for **MISO** that visualizes **basis risk** by utility territory, and shows the congestion context of any dropped pin.

Basis risk here means the spread between a hub or reference price and the local price: congestion and loss components that can make a site structurally more expensive (or less bankable) even when nameplate power looks available.

Decisions made for this phase:

- **MISO only**, which is now the scope of the whole product, not just this phase. PJM is deferred: it requires an API key and publishes no price-node coordinates.
- **A zone choropleth, not a smooth heatmap.** Neither MISO nor PJM publishes coordinates for price nodes, so a continuous surface would be invented. Zone-level day-ahead prices are joined to HIFLD retail service territory polygons instead.
- **Structural, not live.** Values are a 30-day average of MISO day-ahead ex-post prices, rebuilt offline by `npm run build:congestion` into a static file. There is no runtime price API. Most zones use their `*.AZ` price node; Entergy's operating companies publish no such node, so they use the load-weighted `…LD` node instead (for example `EAI.EAILD`), which was checked against the matching hub before being mapped.
- **"Congestion-exposed" replaces "net-importing".** HIFLD's net-generation fields are sparse, dated and misleading in restructured states, so exposure is a price-based proxy: a zone is congestion-exposed when congestion both adds cost on average and does so in a large share of hours (thresholds in `lib/grid/exposure.ts`, calibrated on the real data).

Scope:

- Overlay MISO zone congestion as a choropleth beneath the transmission lines, colored by either average congestion cost ($/MWh) or the share of hours congested, with a legend, layer toggles, and hover detail.
- Show, for a dropped pin, the utility zone it sits in: average congestion, hours congested, price versus a reference hub (mean and spread), a congestion-exposure badge, and a caveat when a zone's average is driven by a few extreme hours.
- Be explicit about coverage: only utilities with a matched price zone are shaded, and a pin outside them says so rather than implying zero congestion.

Out of scope for Phase 2:

- PJM and other markets.
- Live or forecast prices.
- Full nodal market simulation.
- The FTM vs. BYOP calculator (Phase 3).

### Phase 3 — FTM vs. BYOP sidebar calculator

**Outcome:** A sidebar calculator that compares **Front-of-the-Meter (FTM)** utility phased ramps against **Bring Your Own Power (BYOP)** natural gas microgrid deployments.

FTM assumes the project takes utility power over a phased interconnection ramp (queue, studies, and stepped MW availability). BYOP assumes on-site generation (natural gas microgrid) to serve load when the grid cannot, or will not, deliver the required schedule.

Scope:

- Sidebar UI bound to the dropped pin / site context.
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

- **Phase 1:** A professional can drop a pin anywhere on the map and immediately see how far it is from high-voltage transmission, and at what voltage.
- **Phase 2:** A professional can see whether a candidate MISO location sits in a congestion-exposed utility zone and reason about basis risk.
- **Phase 3:** A professional can compare a utility FTM ramp path with a BYOP gas microgrid path for the same site without leaving the map workspace.

## 6. Non-goals

- Replacing utility interconnection studies or ISO/RTO official queue tools.
- Serving as a cadastral / legal land records system of record.
- Automated site acquisition or offer generation.
- Building all three phases in a single implementation pass.
