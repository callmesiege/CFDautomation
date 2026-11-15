/**
 * Representative circuit profiles for the lap simulator.
 *
 * Each circuit is a loop of straights and constant-radius corners. Radii and lengths are
 * engineering approximations of the real layouts (good enough to reproduce each track's
 * character — straight share, corner-speed mix, elevation — not a survey-grade map).
 * `xmode` marks straights where the 2026 active-aero low-drag mode is available.
 */
export interface Segment {
  type: 'straight' | 'corner'
  /** segment length (m) */
  length: number
  /** corner radius (m) — corners only */
  radius?: number
  /** active-aero X-mode zone */
  xmode?: boolean
  name?: string
}

export interface Circuit {
  id: string
  name: string
  country: string
  elevation: number
  /** typical race-weekend ambient conditions */
  typical: { airTempC: number; trackTempC: number; humidity: number; pressureHPa: number; windMS: number }
  /** surface grip multiplier (1 = reference permanent circuit) */
  surfaceGrip: number
  /** bumpiness → minimum sensible rear ride height (mm) */
  minRideHeightRear: number
  /** official lap distance (m); straights are scaled so the segments sum to it */
  realLength: number
  /** lap distance (m), computed from the segments */
  length: number
  /** reference pole lap (s), for context only */
  referenceLapS: number
  segments: Segment[]
  character: string
}

const S = (length: number, xmode = false, name?: string): Segment => ({ type: 'straight', length, xmode, name })
const C = (radius: number, length: number, name?: string): Segment => ({ type: 'corner', radius, length, name })

function circuit(c: Omit<Circuit, 'length'>): Circuit {
  const corners = c.segments.filter((x) => x.type === 'corner').reduce((s, x) => s + x.length, 0)
  const straights = c.segments.filter((x) => x.type === 'straight').reduce((s, x) => s + x.length, 0)
  const k = Math.max(0.5, (c.realLength - corners) / Math.max(1, straights))
  const segments = c.segments.map((x) => (x.type === 'straight' ? { ...x, length: Math.round(x.length * k) } : x))
  return { ...c, segments, length: segments.reduce((s, x) => s + x.length, 0) }
}

export const CIRCUITS: Circuit[] = [
  circuit({
    id: 'monza',
    realLength: 5793,
    name: 'Monza',
    country: 'Italy',
    elevation: 162,
    typical: { airTempC: 27, trackTempC: 40, humidity: 55, pressureHPa: 994, windMS: 1 },
    surfaceGrip: 1.0,
    minRideHeightRear: 50,
    referenceLapS: 79.3,
    character: 'Lowest-downforce circuit of the year: four long full-throttle sections joined by chicanes. Drag dominates.',
    segments: [S(1120, true, 'Start/finish'), C(25, 60, 'Variante del Rettifilo'), S(380), C(300, 520, 'Curva Grande'), S(420, true), C(30, 70, 'Variante della Roggia'), S(260), C(70, 120, 'Lesmo 1'), S(180), C(60, 100, 'Lesmo 2'), S(920, true, 'Serraglio'), C(90, 330, 'Ascari'), S(1040, true, 'Back straight'), C(80, 320, 'Parabolica'), S(80)],
  }),
  circuit({
    id: 'monaco',
    realLength: 3337,
    name: 'Monaco',
    country: 'Monaco',
    elevation: 20,
    typical: { airTempC: 23, trackTempC: 42, humidity: 60, pressureHPa: 1012, windMS: 2 },
    surfaceGrip: 0.96,
    minRideHeightRear: 68,
    referenceLapS: 70.3,
    character: 'Slowest and bumpiest circuit: every corner is below 150 km/h and there is no straight long enough for X-mode. Maximum downforce and mechanical grip.',
    segments: [S(280, false, 'Start/finish'), C(38, 55, 'Sainte Dévote'), S(420, false, 'Beau Rivage'), C(75, 130, 'Massenet'), C(50, 55, 'Casino'), S(160), C(32, 50, 'Mirabeau'), S(90), C(11, 35, 'Fairmont hairpin'), S(70), C(38, 60, 'Portier'), S(120), C(250, 420, 'Tunnel'), S(330), C(24, 50, 'Nouvelle chicane'), S(140), C(60, 80, 'Tabac'), S(110), C(55, 65, 'Piscine entry'), S(60), C(40, 60, 'Piscine exit'), S(130), C(22, 50, 'La Rascasse'), S(80), C(36, 50, 'Anthony Noghès'), S(220)],
  }),
  circuit({
    id: 'silverstone',
    realLength: 5891,
    name: 'Silverstone',
    country: 'United Kingdom',
    elevation: 150,
    typical: { airTempC: 19, trackTempC: 32, humidity: 65, pressureHPa: 996, windMS: 5 },
    surfaceGrip: 1.0,
    minRideHeightRear: 52,
    referenceLapS: 85.8,
    character: 'High-speed flowing circuit: Maggotts–Becketts and Copse reward downforce and aero efficiency; two long straights keep drag relevant.',
    segments: [S(360, false, 'Start/finish'), C(150, 200, 'Abbey'), C(200, 150, 'Farm'), S(220), C(30, 80, 'Village'), C(20, 60, 'The Loop'), C(60, 70, 'Aintree'), S(780, true, 'Wellington straight'), C(55, 90, 'Brooklands'), C(45, 150, 'Luffield'), C(150, 150, 'Woodcote'), S(520, true, 'National pit straight'), C(140, 200, 'Copse'), S(260), C(120, 150, 'Maggotts'), C(90, 150, 'Becketts'), C(70, 120, 'Becketts exit'), C(100, 100, 'Chapel'), S(870, true, 'Hangar straight'), C(100, 200, 'Stowe'), S(320), C(30, 80, 'Vale'), C(60, 150, 'Club'), S(420)],
  }),
  circuit({
    id: 'spa',
    realLength: 7004,
    name: 'Spa-Francorchamps',
    country: 'Belgium',
    elevation: 400,
    typical: { airTempC: 17, trackTempC: 28, humidity: 75, pressureHPa: 966, windMS: 3 },
    surfaceGrip: 1.0,
    minRideHeightRear: 55,
    referenceLapS: 101.5,
    character: 'Longest lap: a 2 km full-throttle climb to Les Combes and the Blanchimont run demand low drag, while Pouhon and the middle sector want downforce. The classic efficiency compromise.',
    segments: [S(400, false, 'Start/finish'), C(18, 60, 'La Source'), S(720, true, 'Down to Eau Rouge'), C(120, 300, 'Eau Rouge / Raidillon'), S(1100, true, 'Kemmel straight'), C(45, 80, 'Les Combes'), C(60, 60, 'Malmedy entry'), S(220), C(70, 100, 'Malmedy'), S(320), C(35, 90, 'Rivage'), S(160), C(80, 100, 'Turn 9'), C(130, 350, 'Pouhon'), S(260), C(50, 90, 'Fagnes'), C(60, 70, 'Fagnes exit'), S(220), C(60, 100, 'Stavelot'), S(500), C(250, 500, 'Blanchimont'), S(800, true, 'Run to Bus Stop'), C(25, 70, 'Bus Stop chicane'), S(240)],
  }),
  circuit({
    id: 'mexico',
    realLength: 4304,
    name: 'Mexico City',
    country: 'Mexico',
    elevation: 2240,
    typical: { airTempC: 24, trackTempC: 42, humidity: 40, pressureHPa: 780, windMS: 2 },
    surfaceGrip: 0.97,
    minRideHeightRear: 52,
    referenceLapS: 75.9,
    character: 'At 2240 m the air is ~25 % thinner: every wing makes less downforce and less drag, so teams run maximum wing yet still see the highest top speeds. Cooling is marginal.',
    segments: [S(1240, true, 'Start/finish'), C(40, 80, 'Turn 1'), C(50, 60, 'Turn 2'), C(60, 60, 'Turn 3'), S(640, true, 'Back straight'), C(40, 80, 'Turn 4'), C(45, 60, 'Turn 5'), S(320), C(60, 70, 'Turn 7'), C(55, 70, 'Turn 8'), C(70, 80, 'Turn 9'), S(440, true), C(50, 60, 'Turn 12'), C(30, 70, 'Stadium 13'), C(35, 60, 'Stadium 14'), C(25, 60, 'Stadium 15'), S(220), C(90, 260, 'Peraltada'), S(160)],
  }),
  circuit({
    id: 'singapore',
    realLength: 4940,
    name: 'Singapore',
    country: 'Singapore',
    elevation: 5,
    typical: { airTempC: 31, trackTempC: 36, humidity: 80, pressureHPa: 1009, windMS: 1 },
    surfaceGrip: 0.95,
    minRideHeightRear: 66,
    referenceLapS: 90.9,
    character: 'Hot, humid street circuit with 19 mostly 90° corners and only one X-mode zone: maximum downforce, big cooling and a raised ride height for the bumps.',
    segments: [S(640, true, 'Start/finish'), C(44, 50, 'Turn 1'), S(160), C(58, 50, 'Turn 3'), S(220), C(51, 50, 'Turn 5'), S(520, true, 'Raffles Boulevard'), C(36, 45, 'Turn 7'), S(220), C(58, 60, 'Turn 8'), S(260), C(44, 50, 'Turn 9'), S(160), C(51, 50, 'Turn 10'), S(320), C(58, 50, 'Turn 11'), S(160), C(44, 50, 'Turn 13'), S(270), C(65, 60, 'Turn 14'), S(220), C(44, 50, 'Turn 15'), S(420), C(51, 50, 'Turn 16'), S(160), C(44, 50, 'Turn 17'), S(320), C(58, 60, 'Turn 18'), S(200)],
  }),
  circuit({
    id: 'bahrain',
    realLength: 5412,
    name: 'Bahrain',
    country: 'Bahrain',
    elevation: 7,
    typical: { airTempC: 27, trackTempC: 30, humidity: 35, pressureHPa: 1011, windMS: 4 },
    surfaceGrip: 1.0,
    minRideHeightRear: 50,
    referenceLapS: 89.2,
    character: 'Stop-and-go circuit with four long straights and heavy braking zones: medium downforce, traction and brake cooling matter.',
    segments: [S(1050, true, 'Start/finish'), C(30, 70, 'Turn 1'), C(80, 150, 'Turns 2-3'), S(640, true), C(40, 80, 'Turn 4'), S(220), C(90, 200, 'Turns 5-7'), S(260), C(35, 70, 'Turn 8'), S(160), C(40, 100, 'Turns 9-10'), S(540, true), C(60, 110, 'Turn 11'), C(200, 150, 'Turn 12'), S(320), C(50, 80, 'Turn 13'), S(440, true), C(30, 70, 'Turn 14'), C(100, 150, 'Turn 15'), S(120)],
  }),
  circuit({
    id: 'interlagos',
    realLength: 4309,
    name: 'Interlagos',
    country: 'Brazil',
    elevation: 780,
    typical: { airTempC: 25, trackTempC: 38, humidity: 70, pressureHPa: 925, windMS: 3 },
    surfaceGrip: 0.98,
    minRideHeightRear: 60,
    referenceLapS: 70.6,
    character: 'Short, bumpy and anticlockwise, with a long full-throttle climb from Junção to Turn 1 and a twisty middle sector. Medium-high downforce with an eye on straight-line speed.',
    segments: [S(320, false, 'Start/finish'), C(60, 90, 'Senna S entry'), C(40, 80, 'Senna S exit'), S(520, true, 'Reta Oposta'), C(150, 200, 'Descida do Lago'), S(300), C(90, 200, 'Ferradura'), C(60, 80, 'Turn 6'), S(160), C(50, 60, 'Laranjinha'), S(110), C(40, 70, 'Pinheirinho entry'), S(300), C(40, 80, 'Pinheirinho'), S(200), C(30, 60, 'Bico de Pato'), S(260), C(70, 150, 'Mergulho'), S(300), C(45, 70, 'Junção'), S(920, true, 'Subida dos Boxes')],
  }),
  circuit({
    id: 'redbullring',
    realLength: 4318,
    name: 'Red Bull Ring',
    country: 'Austria',
    elevation: 680,
    typical: { airTempC: 24, trackTempC: 40, humidity: 50, pressureHPa: 935, windMS: 2 },
    surfaceGrip: 1.0,
    minRideHeightRear: 50,
    referenceLapS: 64.3,
    character: 'Shortest lap of the year: three uphill straights into slow corners and a fast final sector. Low-to-medium downforce.',
    segments: [S(660, true, 'Start/finish'), C(50, 80, 'Turn 1'), S(680, true, 'Climb to Turn 3'), C(30, 70, 'Remus'), S(740, true), C(35, 80, 'Schlossgold'), S(220), C(150, 100, 'Turn 5'), C(90, 120, 'Turn 6'), S(260), C(60, 100, 'Turn 7'), S(420), C(80, 120, 'Rindt'), C(60, 100, 'Red Bull Mobile'), S(380)],
  }),
  circuit({
    id: 'suzuka',
    realLength: 5807,
    name: 'Suzuka',
    country: 'Japan',
    elevation: 45,
    typical: { airTempC: 22, trackTempC: 34, humidity: 65, pressureHPa: 1010, windMS: 3 },
    surfaceGrip: 1.0,
    minRideHeightRear: 52,
    referenceLapS: 88.2,
    character: 'Figure-of-eight with the high-speed Esses, Spoon and 130R: the purest downforce-and-balance circuit, with one X-mode zone on the back straight.',
    segments: [S(760, false, 'Start/finish'), C(120, 250, 'Turns 1-2'), S(120), C(70, 100, 'Esses 1'), C(65, 100, 'Esses 2'), C(75, 100, 'Esses 3'), C(60, 100, 'Esses 4'), C(100, 200, 'Dunlop'), S(180), C(60, 80, 'Degner 1'), C(35, 50, 'Degner 2'), S(360), C(22, 60, 'Hairpin'), S(400), C(80, 200, 'Spoon entry'), C(60, 150, 'Spoon exit'), S(1150, true, 'Back straight'), C(200, 260, '130R'), S(320), C(20, 50, 'Casio triangle'), S(430)],
  }),
  circuit({
    id: 'jeddah',
    realLength: 6174,
    name: 'Jeddah',
    country: 'Saudi Arabia',
    elevation: 3,
    typical: { airTempC: 29, trackTempC: 33, humidity: 60, pressureHPa: 1008, windMS: 3 },
    surfaceGrip: 0.98,
    minRideHeightRear: 56,
    referenceLapS: 87.5,
    character: 'Fastest street circuit: long X-mode zones and strings of flat-out kinks. Low drag with enough load to keep the high-speed corners flat.',
    segments: [S(780, true, 'Start/finish'), C(30, 60, 'Turn 1'), C(40, 60, 'Turn 2'), S(320), C(180, 200, 'Turns 4-5'), C(220, 200, 'Turns 6-7'), S(260), C(160, 180, 'Turns 8-9'), C(200, 180, 'Turns 10-11'), S(360), C(120, 160, 'Turn 13'), S(880, true, 'Turns 14-20 run'), C(260, 300, 'Turn 22 kink'), S(320), C(60, 90, 'Turn 23'), S(620, true), C(70, 120, 'Turn 26'), C(45, 80, 'Turn 27'), S(300)],
  }),
  circuit({
    id: 'barcelona',
    realLength: 4657,
    name: 'Barcelona-Catalunya',
    country: 'Spain',
    elevation: 110,
    typical: { airTempC: 26, trackTempC: 44, humidity: 50, pressureHPa: 1003, windMS: 4 },
    surfaceGrip: 1.0,
    minRideHeightRear: 50,
    referenceLapS: 72.0,
    character: 'The all-round reference circuit: a long main straight, the long fast Turn 3, medium-speed corners and a traction-limited final sector.',
    segments: [S(1020, true, 'Start/finish'), C(60, 100, 'Turn 1'), C(70, 80, 'Turn 2'), C(150, 320, 'Turn 3'), S(260), C(55, 100, 'Turn 4'), S(200), C(45, 90, 'Turn 5'), S(380), C(60, 120, 'Turn 7'), S(180), C(140, 220, 'Turn 9'), S(560, true, 'Back straight'), C(30, 70, 'Turn 10'), S(160), C(60, 80, 'Turn 11'), C(80, 100, 'Turn 12'), S(200), C(40, 70, 'Turn 13'), C(90, 120, 'Turn 14'), S(300)],
  }),
]

export function findCircuit(id: string): Circuit {
  return CIRCUITS.find((c) => c.id === id) ?? CIRCUITS[0]
}

export interface CircuitStats {
  straightShare: number
  xmodeShare: number
  slow: number
  medium: number
  fast: number
  longestStraight: number
  cornerCount: number
}

export function circuitStats(c: Circuit): CircuitStats {
  let straight = 0
  let xmode = 0
  let slow = 0
  let medium = 0
  let fast = 0
  let longest = 0
  for (const s of c.segments) {
    if (s.type === 'straight') {
      straight += s.length
      if (s.xmode) xmode += s.length
      longest = Math.max(longest, s.length)
    } else if (s.radius! < 50) slow++
    else if (s.radius! < 120) medium++
    else fast++
  }
  return { straightShare: straight / c.length, xmodeShare: xmode / c.length, slow, medium, fast, longestStraight: longest, cornerCount: slow + medium + fast }
}

/** Weather for a session. Pressure is derived from the circuit elevation unless overridden. */
export interface Weather {
  condition: 'dry' | 'damp' | 'wet'
  airTempC: number
  trackTempC: number
  humidity: number
  windMS: number
  pressureHPa: number | null
}

export function typicalWeather(c: Circuit): Weather {
  return { condition: 'dry', airTempC: c.typical.airTempC, trackTempC: c.typical.trackTempC, humidity: c.typical.humidity, windMS: c.typical.windMS, pressureHPa: null }
}

/** Tyre friction coefficient for the conditions. */
export function gripCoefficient(c: Circuit, w: Weather): number {
  const base = 1.82
  const cond = w.condition === 'dry' ? 1 : w.condition === 'damp' ? 0.86 : 0.72
  // slick working window around ~40 °C track temperature
  const temp = 1 - 0.0022 * Math.abs(w.trackTempC - 40)
  return base * cond * c.surfaceGrip * temp
}
