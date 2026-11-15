import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultCar, makeElement, uid, type CarDesign, type CustomPart, type WingElement } from '../model/types'
import { defaultAtmosphere, type Atmosphere } from '../sim/atmosphere'

export type Tab = 'dashboard' | 'regulations' | 'model' | 'tunnel' | 'aero' | 'parts'

export type WingKey = 'frontWing' | 'rearWing'

export interface TunnelSettings {
  mode: 'frontWing' | 'rearWing' | 'part'
  partId: string | null
  /** lateral station of the 2-D section (mm from centreline) */
  station: number
  reCap: number
  field: 'speed' | 'pressure' | 'vorticity'
  particles: boolean
  streamlines: boolean
  rollingRoad: boolean
  stepsPerFrame: number
}

export interface SavedDesign {
  id: string
  name: string
  savedAt: number
  car: CarDesign
}

interface AppState {
  tab: Tab
  car: CarDesign
  atmosphere: Atmosphere
  speedKMH: number
  library: CustomPart[]
  savedDesigns: SavedDesign[]
  tunnel: TunnelSettings
  setTunnel: (patch: Partial<TunnelSettings>) => void
  setTab: (t: Tab) => void
  setCar: (fn: (c: CarDesign) => CarDesign) => void
  updateCar: (patch: Partial<CarDesign>) => void
  setAtmosphere: (patch: Partial<Atmosphere>) => void
  setSpeed: (v: number) => void
  setElement: (wing: WingKey, id: string, patch: Partial<WingElement>) => void
  addElement: (wing: WingKey) => void
  removeElement: (wing: WingKey, id: string) => void
  moveElement: (wing: WingKey, id: string, dir: -1 | 1) => void
  toggleAeroMode: () => void
  savePart: (p: CustomPart) => void
  deletePart: (id: string) => void
  mountPart: (id: string) => void
  unmountPart: (id: string) => void
  saveDesign: (name: string) => void
  loadDesign: (id: string) => void
  deleteDesign: (id: string) => void
  importCar: (car: CarDesign) => void
  resetCar: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tab: 'dashboard',
      car: defaultCar(),
      atmosphere: defaultAtmosphere(),
      speedKMH: 250,
      library: [],
      savedDesigns: [],
      tunnel: { mode: 'frontWing', partId: null, station: 520, reCap: 3000, field: 'speed', particles: true, streamlines: false, rollingRoad: true, stepsPerFrame: 4 },
      setTunnel: (patch) => set({ tunnel: { ...get().tunnel, ...patch } }),
      setTab: (tab) => set({ tab }),
      setCar: (fn) => set({ car: fn(get().car) }),
      updateCar: (patch) => set({ car: { ...get().car, ...patch } }),
      setAtmosphere: (patch) => set({ atmosphere: { ...get().atmosphere, ...patch } }),
      setSpeed: (speedKMH) => set({ speedKMH }),
      setElement: (wing, id, patch) =>
        set({
          car: {
            ...get().car,
            [wing]: { ...get().car[wing], elements: get().car[wing].elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
          },
        }),
      addElement: (wing) => {
        const car = get().car
        const els = car[wing].elements
        const last = els[els.length - 1]
        const el = last
          ? makeElement({ ...last, id: uid('el'), name: `Flap ${els.length}`, x: last.x + last.chord * 0.8, z: last.z + last.chord * 0.35, chord: last.chord * 0.75, tipChord: last.tipChord * 0.75, angle: last.angle + 10, active: true })
          : makeElement({ name: 'Main plane' })
        set({ car: { ...car, [wing]: { ...car[wing], elements: [...els, el] } } })
      },
      removeElement: (wing, id) => {
        const car = get().car
        set({ car: { ...car, [wing]: { ...car[wing], elements: car[wing].elements.filter((e) => e.id !== id) } } })
      },
      moveElement: (wing, id, dir) => {
        const car = get().car
        const els = [...car[wing].elements]
        const i = els.findIndex((e) => e.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= els.length) return
        ;[els[i], els[j]] = [els[j], els[i]]
        set({ car: { ...car, [wing]: { ...car[wing], elements: els } } })
      },
      toggleAeroMode: () => set({ car: { ...get().car, aeroMode: get().car.aeroMode === 'Z' ? 'X' : 'Z' } }),
      savePart: (p) => {
        const lib = get().library
        const exists = lib.some((x) => x.id === p.id)
        set({ library: exists ? lib.map((x) => (x.id === p.id ? p : x)) : [...lib, p] })
        // keep mounted copies in sync
        const car = get().car
        if (car.parts.some((x) => x.id === p.id)) set({ car: { ...car, parts: car.parts.map((x) => (x.id === p.id ? p : x)) } })
      },
      deletePart: (id) => {
        set({ library: get().library.filter((x) => x.id !== id), car: { ...get().car, parts: get().car.parts.filter((x) => x.id !== id) } })
      },
      mountPart: (id) => {
        const p = get().library.find((x) => x.id === id)
        if (!p) return
        const car = get().car
        if (car.parts.some((x) => x.id === id)) return
        set({ car: { ...car, parts: [...car.parts, p] } })
      },
      unmountPart: (id) => set({ car: { ...get().car, parts: get().car.parts.filter((x) => x.id !== id) } }),
      saveDesign: (name) => {
        const car = { ...get().car, name }
        const entry: SavedDesign = { id: uid('design'), name, savedAt: Date.now(), car: JSON.parse(JSON.stringify(car)) }
        set({ savedDesigns: [entry, ...get().savedDesigns].slice(0, 50), car })
      },
      loadDesign: (id) => {
        const d = get().savedDesigns.find((x) => x.id === id)
        if (d) set({ car: JSON.parse(JSON.stringify(d.car)) })
      },
      deleteDesign: (id) => set({ savedDesigns: get().savedDesigns.filter((x) => x.id !== id) }),
      importCar: (car) => set({ car }),
      resetCar: () => set({ car: defaultCar() }),
    }),
    { name: 'apex-studio-v1', version: 1 },
  ),
)
