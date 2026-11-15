import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { CarDesign } from './types'
import { buildCarMeshes } from './geometry'

export function carToScene(car: CarDesign): THREE.Group {
  const group = new THREE.Group()
  group.name = car.name
  const m = buildCarMeshes(car)
  const add = (g: THREE.BufferGeometry, name: string) => {
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
    mesh.name = name
    group.add(mesh)
  }
  m.wings.forEach((w) => add(w.geometry, `${w.wing}-${w.el.name}`))
  m.endplates.forEach((g, i) => add(g, `endplate-${i}`))
  m.body.forEach((g, i) => add(g, `body-${i}`))
  m.floor.forEach((g, i) => add(g, `floor-${i}`))
  m.tyres.forEach((g, i) => add(g, `tyre-${i}`))
  m.rims.forEach((g, i) => add(g, `rim-${i}`))
  m.details.forEach((g, i) => add(g, `detail-${i}`))
  m.parts.forEach((p) => add(p.geometry, `part-${p.part.name}`))
  return group
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportSTL(car: CarDesign): void {
  const scene = carToScene(car)
  const data = new STLExporter().parse(scene, { binary: true }) as unknown as DataView
  const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  download(new Blob([bytes], { type: 'model/stl' }), `${car.name}.stl`)
}

export function exportOBJ(car: CarDesign): void {
  const scene = carToScene(car)
  const text = new OBJExporter().parse(scene)
  download(new Blob([text], { type: 'text/plain' }), `${car.name}.obj`)
}

export async function exportGLB(car: CarDesign): Promise<void> {
  const scene = carToScene(car)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(scene, { binary: true })
  const blob = result instanceof ArrayBuffer ? new Blob([result], { type: 'model/gltf-binary' }) : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
  download(blob, `${car.name}.glb`)
}

export function exportJSON(car: CarDesign): void {
  download(new Blob([JSON.stringify(car, null, 2)], { type: 'application/json' }), `${car.name}.apex.json`)
}

export function importJSONFile(): Promise<CarDesign | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        const car = JSON.parse(await file.text()) as CarDesign
        if (!car.chassis || !car.frontWing || !car.rearWing) throw new Error('not a car design')
        resolve(car)
      } catch {
        resolve(null)
      }
    }
    input.click()
  })
}
