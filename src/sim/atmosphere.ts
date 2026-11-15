/** Atmospheric state used by every solver in the app. */
export interface Atmosphere {
  /** ambient temperature (°C) */
  temperatureC: number
  /** station pressure (hPa). If `useISA` is true this is derived from elevation. */
  pressureHPa: number
  /** relative humidity (0-100 %) */
  humidity: number
  /** elevation above sea level (m) */
  elevation: number
  /** derive pressure from elevation via the International Standard Atmosphere */
  useISA: boolean
  /** head/tail wind along the car axis (m/s, positive = headwind) */
  windMS: number
}

export interface AirProperties {
  density: number // kg/m³
  viscosity: number // Pa·s
  kinematicViscosity: number // m²/s
  speedOfSound: number // m/s
  temperatureK: number
  pressurePa: number
  vapourPressurePa: number
  densityRatio: number // vs ISA sea level 1.225
}

export const R_DRY = 287.058
export const R_VAP = 461.495

export function isaPressurePa(elevation: number, seaLevelPa = 101325): number {
  const T0 = 288.15
  const L = 0.0065
  const h = Math.max(-500, Math.min(11000, elevation))
  return seaLevelPa * Math.pow(1 - (L * h) / T0, 5.25588)
}

export function isaTemperatureC(elevation: number): number {
  return 15 - 0.0065 * Math.max(-500, Math.min(11000, elevation))
}

/** Saturation vapour pressure (Pa) — Arden Buck equation. */
export function saturationVapourPressure(tC: number): number {
  return 611.21 * Math.exp((18.678 - tC / 234.5) * (tC / (257.14 + tC)))
}

export function airProperties(atm: Atmosphere): AirProperties {
  const T = atm.temperatureC + 273.15
  const p = atm.useISA ? isaPressurePa(atm.elevation) : atm.pressureHPa * 100
  const pv = (Math.max(0, Math.min(100, atm.humidity)) / 100) * saturationVapourPressure(atm.temperatureC)
  const pd = Math.max(0, p - pv)
  const density = pd / (R_DRY * T) + pv / (R_VAP * T)
  // Sutherland's law
  const mu = 1.716e-5 * Math.pow(T / 273.15, 1.5) * ((273.15 + 110.4) / (T + 110.4))
  const a = Math.sqrt(1.4 * R_DRY * T)
  return {
    density,
    viscosity: mu,
    kinematicViscosity: mu / density,
    speedOfSound: a,
    temperatureK: T,
    pressurePa: p,
    vapourPressurePa: pv,
    densityRatio: density / 1.225,
  }
}

export function reynolds(air: AirProperties, speedMS: number, lengthM: number): number {
  return (air.density * speedMS * lengthM) / air.viscosity
}

export interface TrackPreset {
  id: string
  name: string
  elevation: number
  temperatureC: number
  humidity: number
  pressureHPa: number
  /** representative top speed (km/h) */
  vmax: number
}

export const TRACKS: TrackPreset[] = [
  { id: 'isa', name: 'ISA sea level (reference)', elevation: 0, temperatureC: 15, humidity: 0, pressureHPa: 1013.25, vmax: 330 },
  { id: 'monza', name: 'Monza', elevation: 162, temperatureC: 28, humidity: 55, pressureHPa: 994, vmax: 350 },
  { id: 'silverstone', name: 'Silverstone', elevation: 150, temperatureC: 19, humidity: 65, pressureHPa: 996, vmax: 325 },
  { id: 'spa', name: 'Spa-Francorchamps', elevation: 400, temperatureC: 17, humidity: 75, pressureHPa: 966, vmax: 340 },
  { id: 'mexico', name: 'Mexico City (Autódromo Hermanos Rodríguez)', elevation: 2240, temperatureC: 24, humidity: 40, pressureHPa: 780, vmax: 350 },
  { id: 'singapore', name: 'Singapore (Marina Bay)', elevation: 5, temperatureC: 31, humidity: 80, pressureHPa: 1009, vmax: 310 },
  { id: 'bahrain', name: 'Bahrain', elevation: 7, temperatureC: 29, humidity: 35, pressureHPa: 1011, vmax: 330 },
  { id: 'interlagos', name: 'Interlagos', elevation: 780, temperatureC: 25, humidity: 70, pressureHPa: 925, vmax: 335 },
  { id: 'monaco', name: 'Monaco', elevation: 20, temperatureC: 23, humidity: 60, pressureHPa: 1012, vmax: 290 },
  { id: 'redbullring', name: 'Red Bull Ring', elevation: 680, temperatureC: 24, humidity: 50, pressureHPa: 935, vmax: 325 },
  { id: 'suzuka', name: 'Suzuka', elevation: 45, temperatureC: 22, humidity: 65, pressureHPa: 1010, vmax: 330 },
  { id: 'jeddah', name: 'Jeddah', elevation: 3, temperatureC: 30, humidity: 60, pressureHPa: 1008, vmax: 340 },
]

export function defaultAtmosphere(): Atmosphere {
  return { temperatureC: 20, pressureHPa: 1013.25, humidity: 50, elevation: 0, useISA: false, windMS: 0 }
}

export function atmosphereFromTrack(t: TrackPreset): Atmosphere {
  return { temperatureC: t.temperatureC, pressureHPa: t.pressureHPa, humidity: t.humidity, elevation: t.elevation, useISA: false, windMS: 0 }
}
