import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

function RotatingTorus({ position, color, scale }: { position: [number, number, number]; color: string; scale: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * 0.3;
    ref.current.rotation.y += delta * 0.2;
  });
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={ref} position={position} scale={scale}>
        <torusGeometry args={[1, 0.35, 16, 32]} />
        <meshStandardMaterial color={color} transparent opacity={0.35} wireframe />
      </mesh>
    </Float>
  );
}

function RotatingOctahedron({ position, color, scale }: { position: [number, number, number]; color: string; scale: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * 0.2;
    ref.current.rotation.z += delta * 0.15;
  });
  return (
    <Float speed={1.5} rotationIntensity={0.8} floatIntensity={1.5}>
      <mesh ref={ref} position={position} scale={scale}>
        <octahedronGeometry args={[1]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} wireframe />
      </mesh>
    </Float>
  );
}

function FloatingParticles() {
  const count = 80;
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.02;
    ref.current.rotation.x += delta * 0.01;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#0064E0" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

function GridPlane() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.z += delta * 0.01;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 3, 0, 0]} position={[0, -2, -3]}>
      <planeGeometry args={[30, 30, 30, 30]} />
      <meshStandardMaterial color="#0064E0" transparent opacity={0.06} wireframe />
    </mesh>
  );
}

export default function TechBackground() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas camera={{ position: [0, 0, 8], fov: 50 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.4} />

        <RotatingTorus position={[-4, 2, -2]} color="#0064E0" scale={0.9} />
        <RotatingTorus position={[4.5, -1.5, -3]} color="#38bdf8" scale={0.7} />
        <RotatingOctahedron position={[3, 2.5, -1]} color="#0064E0" scale={0.6} />
        <RotatingOctahedron position={[-3.5, -2, -2]} color="#6366f1" scale={0.5} />

        <FloatingParticles />
        <GridPlane />
      </Canvas>
    </div>
  );
}
