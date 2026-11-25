import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { OrbState } from './orbTypes'
import { ORB_PARAMS } from './orbTypes'

/** Soft violet sphere whose surface is displaced on the GPU (no per-frame JS geometry work). */
function Blob({ state, levelRef }: { state: OrbState; levelRef?: MutableRefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uAmp: { value: 0.08 } }), [])
  const cur = useRef({ speed: 0.3, amp: 0.08, color: new THREE.Color(ORB_PARAMS.idle.color), scale: 1 })
  const target = useMemo(() => new THREE.Color(), [])
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#FF7A45', roughness: 0.42, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 1, sheenColor: new THREE.Color('#FFE3CF'), emissive: new THREE.Color('#8A2F0A'), emissiveIntensity: 0.22 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uAmp = uniforms.uAmp
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float n = sin(position.x * 2.1 + uTime) * sin(position.y * 2.4 + uTime * 1.13) * sin(position.z * 1.9 + uTime * 0.87);
          float n2 = sin(position.y * 4.3 - uTime * 1.6) * sin(position.x * 3.7 + uTime * 1.2);
          transformed += normal * (n + 0.35 * n2) * uAmp * 0.45;`)
    }
    return m
  }, [uniforms])
  const t = useRef(0)
  useFrame((_, dt) => {
    const P = ORB_PARAMS[state], c = cur.current, k = 1 - Math.pow(0.001, dt) // frame-rate independent easing
    const lvl = P.audio && levelRef ? Math.min(1, levelRef.current) : 0
    c.speed += (P.speed - c.speed) * k
    c.amp += (P.amp + lvl * 0.4 - c.amp) * Math.min(1, k * 2)
    c.scale += (1 + lvl * 0.12 - c.scale) * Math.min(1, k * 2)
    t.current += dt * c.speed
    uniforms.uTime.value = t.current; uniforms.uAmp.value = c.amp
    target.set(P.color); c.color.lerp(target, k); material.color.copy(c.color)
    if (mesh.current) { mesh.current.rotation.y += dt * 0.12 * (0.4 + c.speed); mesh.current.scale.setScalar(c.scale) }
  })
  return <mesh ref={mesh} material={material}><icosahedronGeometry args={[1.15, 28]} /></mesh>
}

function Rings({ state }: { state: OrbState }) {
  const g = useRef<THREE.Group>(null), col = ORB_PARAMS[state].color
  useFrame((_, dt) => { if (g.current) { g.current.rotation.z += dt * 0.12; g.current.rotation.x += dt * 0.05 } })
  return (
    <group ref={g}>
      {[[1.85, 1.2, 0], [2.1, -0.8, 0.6]].map(([r, rx, ry], i) => (
        <mesh key={i} rotation={[rx as number, ry as number, 0]}><torusGeometry args={[r as number, 0.008, 8, 160]} /><meshBasicMaterial color={col} transparent opacity={0.45} /></mesh>
      ))}
    </group>
  )
}

export default function OrbScene({ state, levelRef, active }: { state: OrbState; levelRef?: MutableRefObject<number>; active: boolean }) {
  return (
    <Canvas frameloop={active ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ position: [0, 0, 5.6], fov: 40 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} style={{ background: 'transparent' }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} color="#ffffff" />
      <pointLight position={[-4, -2, 3]} intensity={18} color="#FFC857" />
      <pointLight position={[3, -3, -2]} intensity={12} color="#FF7A45" />
      <Blob state={state} levelRef={levelRef} />
      <Rings state={state} />
    </Canvas>
  )
}
