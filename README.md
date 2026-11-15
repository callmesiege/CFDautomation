# Apex Studio — F1 car design workbench (2026 regulations)

A browser-only engineering workbench for designing a 2026-style Formula 1 car:

| Tab | What it does |
| --- | --- |
| **Dashboard** | Live downforce / drag / balance / top-speed estimate, legality status, quick design levers, design snapshots, JSON import/export. |
| **Regulations** | A structured digest of the FIA 2026 Technical Regulations (Section C) with every numeric limit tagged by provenance, plus a full compliance report of the current design against those limits. |
| **3D Model** | Fully parametric car (wings, endplates, nose, sidepods, engine cover, floor, diffuser, plank, wheels, halo, suspension). Click an element to edit it. Exports STL / OBJ / GLB. |
| **Wind Tunnel** | Real-time 2-D lattice-Boltzmann flow solve of a wing section. Drag an element to move it, drag the orange trailing-edge handle (or scroll) to change its angle, and watch the flow field and per-element forces update. Edits write straight back into the design. |
| **Aero Simulation** | Whole-car aero map with atmosphere controls (temperature, pressure or ISA elevation, humidity, wind, circuit presets), speed / ride-height / flap-angle sweeps, Reynolds and Mach numbers, X-mode vs Z-mode. |
| **Parts Designer** | Create new parts (wing elements, winglets, endplates, floor fences, diffuser strakes) from NACA 4-digit or custom profiles, preview in 3D, check the bodywork envelope, mount on the car, test in the tunnel. |

Everything runs client-side (React + TypeScript + Three.js + Zustand). Designs and the parts library persist in `localStorage`.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve the production bundle
```

## How the physics works

### Atmosphere (`src/sim/atmosphere.ts`)
* Humid-air density from the partial pressures of dry air and water vapour (Arden Buck saturation curve).
* Station pressure either entered directly or derived from elevation with the International Standard Atmosphere.
* Dynamic viscosity from Sutherland's law; speed of sound from the ideal-gas relation.
* Twelve circuit presets (Monza, Mexico City at 2240 m, Singapore, …).

### Whole-car aero map (`src/sim/aero.ts`)
A fast component build-up, calibrated so the default car sits near the published 2026 targets (~15 % less downforce and ~30 % less drag than a 2025 car):
* **Wings** — thin-airfoil lift per element (zero-lift angle integrated from the NACA camber line), stall softening, slotted-flap stall delay, upstream-element downwash, ground-effect gain for the front wing, lifting-line aspect-ratio correction, endplate efficiency, profile + induced drag.
* **Floor + diffuser** — venturi model with a ride-height optimum and a choke/stall below it, diffuser-angle effectiveness, expansion ratio and rake.
* **Body, wheels, cooling, halo** — frontal-area drag build-up driven by tyre widths, sidepod dimensions and inlet area.
* Outputs: ClA, CdA, L/D, aero balance, axle loads, power to hold speed, quasi-steady top speed, cornering g, Reynolds and Mach.

It is an aero *map* for trade-off studies, not CFD: trends are the reliable part, absolute loads are ±15 %.

### Live wind tunnel (`src/sim/lbm.ts`)
* D2Q9 lattice-Boltzmann (BGK) with a Smagorinsky sub-grid model on a 400 × 160 grid, running at interactive rates on the main thread.
* Velocity inlet, zero-gradient outlet, free-stream top, moving-wall rolling road or fixed floor at the bottom, half-way bounce-back on the elements.
* Lift and drag by momentum exchange at the wall, tagged per element, converted to real forces with the dynamic pressure of the chosen speed and atmosphere and the element's effective span.
* The solver runs at a capped Reynolds number (default 3000, slider up to ~5000 effective) for stability. Real and simulated Re are both displayed.
* The section is cut at a chosen lateral station so sweep, dihedral and taper are honoured; the ground sits at the current ride height.
* Fields: speed, pressure coefficient, vorticity. Overlays: tracer particles, streamlines.

### Regulations (`src/regulations/`)
`regs2026.ts` holds the article digest. Every limit carries a `status`:

| status | meaning |
| --- | --- |
| `official` | figure stated by the FIA in its 2026 announcements (1900 mm width, 3400 mm wheelbase, 768 kg, 3 FW elements, 350 kW MGU-K, 3000 MJ/h, 280/375 mm tyres, …) |
| `reported` | figure reported by teams / specialist press — verify against the current Section C issue |
| `derived` | derived from the 2022-25 rules plus the announced 2026 deltas — verify |
| `target` | not a rule; an engineering target the advisor uses (slot gaps, diffuser angle, plank-wear margin) |

`compliance.ts` evaluates the design against those limits (dimensions, wing spans/heights/element counts, active-element rules, floor and plank, mass and balance, tyre specification, bodywork envelope for custom parts, a flexibility-test estimate for flaps, slot-gap advisories).

**The FIA regulation PDF could not be fetched from this build environment** (fia.com is blocked by the network policy), so the digest is built from the FIA's public announcements and team/press summaries. When you have the current Section C issue, update the values in `regs2026.ts` and bump `REGS_ISSUE`; the compliance engine and the UI pick them up automatically.

## Coordinate system
FIA convention throughout: `x` rearward from the front-axle centre line, `y` lateral, `z` up from the reference plane (plank underside), millimetres and degrees. Exports are in metres with the car facing −X and Y up.

## Project layout
```
src/
  model/        types + default car, NACA/airfoil math, Three.js geometry builders, exporters
  regulations/  2026 digest and compliance engine
  sim/          atmosphere, whole-car aero map, lattice-Boltzmann solver, colour maps
  store/        zustand store (design, atmosphere, parts library, tunnel settings)
  ui/           pages and shared components
```
