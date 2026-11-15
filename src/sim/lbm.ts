/**
 * D2Q9 lattice-Boltzmann solver with a Smagorinsky sub-grid model and momentum-exchange
 * force measurement. Runs on the main thread fast enough for an interactive 2-D wind tunnel.
 *
 * Boundaries:
 *   left   — velocity inlet (equilibrium at u0)
 *   right  — zero-gradient outlet
 *   top    — free-stream (equilibrium at u0)
 *   bottom — rolling road (moving wall at u0) or fixed wall (bounce-back)
 *   bodies — half-way bounce-back, tagged by element id so forces are per element
 */

const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1]
const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1]
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36]
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6]

export interface ElementForce {
  fx: number
  fy: number
}

export class LBM {
  nx: number
  ny: number
  n: number
  f: Float32Array
  ftmp: Float32Array
  rho: Float32Array
  ux: Float32Array
  uy: Float32Array
  /** 0 = fluid, 255 = wall, 1..254 = element id + 1 */
  solid: Uint8Array
  u0 = 0.08
  tau0 = 0.52
  smagorinsky = 0.12
  rollingRoad = true
  forces: ElementForce[] = []
  stepCount = 0

  constructor(nx: number, ny: number) {
    this.nx = nx
    this.ny = ny
    this.n = nx * ny
    this.f = new Float32Array(9 * this.n)
    this.ftmp = new Float32Array(9 * this.n)
    this.rho = new Float32Array(this.n)
    this.ux = new Float32Array(this.n)
    this.uy = new Float32Array(this.n)
    this.solid = new Uint8Array(this.n)
    this.reset()
  }

  /** Set the relaxation time from a target Reynolds number using the given reference length in cells. */
  setReynolds(re: number, lengthCells: number): number {
    const nu = (this.u0 * lengthCells) / Math.max(1, re)
    this.tau0 = Math.max(0.503, Math.min(1.2, 3 * nu + 0.5))
    return this.effectiveReynolds(lengthCells)
  }

  effectiveReynolds(lengthCells: number): number {
    const nu = (this.tau0 - 0.5) / 3
    return (this.u0 * lengthCells) / nu
  }

  private equilibrium(i: number, rho: number, ux: number, uy: number, out: Float32Array): void {
    const usq = 1.5 * (ux * ux + uy * uy)
    for (let q = 0; q < 9; q++) {
      const eu = 3 * (EX[q] * ux + EY[q] * uy)
      out[q * this.n + i] = W[q] * rho * (1 + eu + 0.5 * eu * eu - usq)
    }
  }

  reset(): void {
    const { n } = this
    for (let i = 0; i < n; i++) {
      this.rho[i] = 1
      this.ux[i] = this.solid[i] ? 0 : this.u0
      this.uy[i] = 0
      this.equilibrium(i, 1, this.ux[i], 0, this.f)
    }
    this.ftmp.set(this.f)
    this.stepCount = 0
  }

  /** Replace the obstacle mask. Cells that turn from solid to fluid are seeded with a resting equilibrium. */
  setSolid(mask: Uint8Array): void {
    const { n } = this
    for (let i = 0; i < n; i++) {
      const was = this.solid[i]
      const now = mask[i]
      if (was && !now) {
        this.equilibrium(i, 1, 0, 0, this.f)
        this.ux[i] = 0
        this.uy[i] = 0
        this.rho[i] = 1
      }
    }
    this.solid.set(mask)
    if (!this.rollingRoad) {
      for (let x = 0; x < this.nx; x++) this.solid[x] = 255
    }
  }

  step(iterations = 1): void {
    for (let k = 0; k < iterations; k++) this.collideStream()
  }

  private collideStream(): void {
    const { nx, ny, n, f, ftmp, solid, rho, ux, uy } = this
    const tau0 = this.tau0
    const cs2 = this.smagorinsky * this.smagorinsky
    const forces = this.forces
    for (const fr of forces) {
      fr.fx = 0
      fr.fy = 0
    }
    const feq = new Float32Array(9)
    const fpost = new Float32Array(9)

    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x
        if (solid[i]) continue
        // macroscopic
        let r = 0
        let vx = 0
        let vy = 0
        for (let q = 0; q < 9; q++) {
          const fq = f[q * n + i]
          r += fq
          vx += fq * EX[q]
          vy += fq * EY[q]
        }
        vx /= r
        vy /= r
        rho[i] = r
        ux[i] = vx
        uy[i] = vy
        const usq = 1.5 * (vx * vx + vy * vy)
        // equilibrium + non-equilibrium stress for Smagorinsky
        let pxx = 0
        let pyy = 0
        let pxy = 0
        for (let q = 0; q < 9; q++) {
          const eu = 3 * (EX[q] * vx + EY[q] * vy)
          const e = W[q] * r * (1 + eu + 0.5 * eu * eu - usq)
          feq[q] = e
          const dq = f[q * n + i] - e
          pxx += dq * EX[q] * EX[q]
          pyy += dq * EY[q] * EY[q]
          pxy += dq * EX[q] * EY[q]
        }
        const Q = Math.sqrt(2 * (pxx * pxx + pyy * pyy + 2 * pxy * pxy))
        const tau = tau0 + 0.5 * (Math.sqrt(tau0 * tau0 + (18 * cs2 * Q) / r) - tau0)
        const omega = 1 / tau
        for (let q = 0; q < 9; q++) {
          fpost[q] = f[q * n + i] - omega * (f[q * n + i] - feq[q])
        }
        // stream (push)
        for (let q = 0; q < 9; q++) {
          const xn = x + EX[q]
          const yn = y + EY[q]
          if (xn < 0 || xn >= nx || yn < 0 || yn >= ny) continue
          const j = yn * nx + xn
          const s = solid[j]
          if (s) {
            // bounce back into this cell; momentum exchange force on the body
            const fq = fpost[q]
            ftmp[OPP[q] * n + i] = fq
            if (s !== 255) {
              const id = s - 1
              const fr = forces[id]
              if (fr) {
                fr.fx += 2 * fq * EX[q]
                fr.fy += 2 * fq * EY[q]
              }
            }
          } else {
            ftmp[q * n + j] = fpost[q]
          }
        }
      }
    }

    // boundaries (written into ftmp)
    const u0 = this.u0
    // inlet (x = 0) and top (y = ny-1): free stream
    for (let y = 0; y < ny; y++) {
      const i = y * nx
      if (!solid[i]) this.equilibriumInto(ftmp, i, 1, u0, 0)
      const o = y * nx + nx - 1
      if (!solid[o]) {
        // outlet: copy the populations from the upstream neighbour
        for (let q = 0; q < 9; q++) ftmp[q * n + o] = ftmp[q * n + o - 1]
      }
    }
    for (let x = 0; x < nx; x++) {
      const t = (ny - 1) * nx + x
      if (!solid[t]) this.equilibriumInto(ftmp, t, 1, u0, 0)
      const b = x
      if (!solid[b]) this.equilibriumInto(ftmp, b, 1, this.rollingRoad ? u0 : 0, 0)
    }

    // swap
    this.f = ftmp
    this.ftmp = f
    this.stepCount++
  }

  private equilibriumInto(arr: Float32Array, i: number, r: number, vx: number, vy: number): void {
    const usq = 1.5 * (vx * vx + vy * vy)
    for (let q = 0; q < 9; q++) {
      const eu = 3 * (EX[q] * vx + EY[q] * vy)
      arr[q * this.n + i] = W[q] * r * (1 + eu + 0.5 * eu * eu - usq)
    }
  }

  /** z-vorticity (dUy/dx − dUx/dy) on the interior of the grid. */
  vorticity(out: Float32Array): void {
    const { nx, ny, ux, uy, solid } = this
    out.fill(0)
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const i = y * nx + x
        if (solid[i]) continue
        const dvdx = (uy[i + 1] - uy[i - 1]) * 0.5
        const dudy = (ux[i + nx] - ux[i - nx]) * 0.5
        out[i] = dvdx - dudy
      }
    }
  }

  /** Lattice force → coefficient. Uses chord in cells as the reference length (2-D, per unit span). */
  coefficient(force: number, chordCells: number): number {
    return force / (0.5 * 1 * this.u0 * this.u0 * chordCells)
  }

  /** Bilinear velocity sample for particle advection. */
  sampleVelocity(px: number, py: number): [number, number] {
    const { nx, ny, ux, uy } = this
    const x0 = Math.floor(px)
    const y0 = Math.floor(py)
    if (x0 < 0 || y0 < 0 || x0 >= nx - 1 || y0 >= ny - 1) return [this.u0, 0]
    const tx = px - x0
    const ty = py - y0
    const i00 = y0 * nx + x0
    const i10 = i00 + 1
    const i01 = i00 + nx
    const i11 = i01 + 1
    const vx = (ux[i00] * (1 - tx) + ux[i10] * tx) * (1 - ty) + (ux[i01] * (1 - tx) + ux[i11] * tx) * ty
    const vy = (uy[i00] * (1 - tx) + uy[i10] * tx) * (1 - ty) + (uy[i01] * (1 - tx) + uy[i11] * tx) * ty
    return [vx, vy]
  }
}
