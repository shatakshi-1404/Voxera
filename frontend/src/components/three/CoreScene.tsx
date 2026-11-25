import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

const EMBER = '#FF7A45', GOLD = '#FFC857', MINT = '#5EEAD4'

/** "Voice Core": glowing sphere, orbiting metallic rings, linked nodes and a particle field. */
function Core({ active }: { active: boolean }) {
  const root = useRef<THREE.Group>(null), rings = useRef<THREE.Group>(null), pts = useRef<THREE.Points>(null), nodesRef = useRef<THREE.Group>(null)
  const mouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const h = (e: PointerEvent) => { mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1 }
    window.addEventListener('pointermove', h, { passive: true }); return () => window.removeEventListener('pointermove', h)
  }, [])
  const nodes = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const phi = Math.acos(1 - 2 * (i + 0.5) / 16), th = Math.PI * (1 + Math.sqrt(5)) * i, r = 2.15
    return new THREE.Vector3(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th))
  }), [])
  const lines = useMemo(() => {
    const p: number[] = []
    nodes.forEach((a, i) => nodes.forEach((b, j) => { if (j > i && a.distanceTo(b) < 2.3) p.push(a.x, a.y, a.z, b.x, b.y, b.z) }))
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g
  }, [nodes])
  const particles = useMemo(() => {
    const n = 320, a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { const r = 3 + Math.random() * 3.2, t = Math.random() * 6.283, p = Math.acos(2 * Math.random() - 1); a[i * 3] = r * Math.sin(p) * Math.cos(t); a[i * 3 + 1] = r * Math.cos(p); a[i * 3 + 2] = r * Math.sin(p) * Math.sin(t) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g
  }, [])
  useFrame((s, dt) => {
    if (!active) return
    const t = s.clock.elapsedTime
    if (root.current) { root.current.rotation.y += (mouse.current.x * 0.6 - root.current.rotation.y) * Math.min(1, dt * 2); root.current.rotation.x += (mouse.current.y * 0.35 - root.current.rotation.x) * Math.min(1, dt * 2); root.current.position.y = Math.sin(t * 0.8) * 0.08 }
    if (rings.current) { rings.current.children.forEach((c, i) => { c.rotation.z += dt * (0.18 + i * 0.1) * (i % 2 ? -1 : 1) }) }
    if (nodesRef.current) nodesRef.current.rotation.y += dt * 0.1
    if (pts.current) pts.current.rotation.y -= dt * 0.03
  })
  return (
    <group ref={root}>
      <mesh><icosahedronGeometry args={[1.2, 5]} /><meshPhysicalMaterial color="#2b1308" emissive={EMBER} emissiveIntensity={0.55} roughness={0.15} metalness={0.2} clearcoat={1} transparent opacity={0.96} /></mesh>
      <mesh scale={1.45}><sphereGeometry args={[1.2, 32, 32]} /><meshBasicMaterial color={EMBER} transparent opacity={0.07} depthWrite={false} side={THREE.BackSide} /></mesh>
      <group ref={rings} rotation={[0.5, 0, 0.2]}>
        {[[1.7, 0], [2.05, 1.1], [2.5, -0.9]].map(([r, rx], i) => (
          <mesh key={i} rotation={[Math.PI / 2 + (rx as number) * 0.5, (rx as number) * 0.3, 0]}><torusGeometry args={[r as number, 0.012 + i * 0.004, 12, 200]} /><meshStandardMaterial color={i === 1 ? GOLD : '#d9d2c8'} metalness={1} roughness={0.28} emissive={i === 1 ? GOLD : EMBER} emissiveIntensity={0.25} /></mesh>
        ))}
      </group>
      <group ref={nodesRef}>
        <lineSegments geometry={lines}><lineBasicMaterial color={EMBER} transparent opacity={0.28} /></lineSegments>
        {nodes.map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[i % 5 === 0 ? 0.075 : 0.045, 12, 12]} /><meshBasicMaterial color={i % 5 === 0 ? MINT : GOLD} /></mesh>)}
      </group>
      <points ref={pts} geometry={particles}><pointsMaterial color="#FFD9B8" size={0.025} transparent opacity={0.7} sizeAttenuation depthWrite={false} /></points>
    </group>
  )
}

export default function CoreScene({ active }: { active: boolean }) {
  return (
    <Canvas frameloop={active ? 'always' : 'demand'} dpr={[1, 1.6]} camera={{ position: [0, 0, 7.2], fov: 42 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} style={{ background: 'transparent' }}>
      <ambientLight intensity={0.5} /><pointLight position={[4, 3, 5]} intensity={40} color={GOLD} /><pointLight position={[-5, -3, 2]} intensity={25} color={EMBER} />
      <Core active={active} />
    </Canvas>
  )
}
