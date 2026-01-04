import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere, Box, Torus, Icosahedron, Stars } from "@react-three/drei";
import * as THREE from "three";

const FloatingShape = ({ 
  position, 
  color, 
  speed = 1, 
  rotationSpeed = 0.01,
  scale = 1,
  shape = "sphere"
}: { 
  position: [number, number, number]; 
  color: string; 
  speed?: number;
  rotationSpeed?: number;
  scale?: number;
  shape?: "sphere" | "box" | "torus" | "icosahedron";
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += rotationSpeed;
      meshRef.current.rotation.y += rotationSpeed * 1.5;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * speed) * 0.3;
    }
  });

  const ShapeComponent = () => {
    switch (shape) {
      case "box":
        return <Box args={[1, 1, 1]} ref={meshRef} scale={scale}><MeshDistortMaterial color={color} speed={2} distort={0.3} /></Box>;
      case "torus":
        return <Torus args={[0.6, 0.25, 16, 32]} ref={meshRef} scale={scale}><MeshDistortMaterial color={color} speed={2} distort={0.2} /></Torus>;
      case "icosahedron":
        return <Icosahedron args={[0.7, 1]} ref={meshRef} scale={scale}><MeshDistortMaterial color={color} speed={2} distort={0.4} /></Icosahedron>;
      default:
        return <Sphere args={[0.7, 32, 32]} ref={meshRef} scale={scale}><MeshDistortMaterial color={color} speed={3} distort={0.4} /></Sphere>;
    }
  };

  return (
    <Float speed={speed} rotationIntensity={0.5} floatIntensity={1}>
      <ShapeComponent />
    </Float>
  );
};

const ParticleField = () => {
  const particlesRef = useRef<THREE.Points>(null);
  
  const particleCount = 500;
  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
      particlesRef.current.rotation.x = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#22d3ee" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
};

const NeuralNetwork = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  const nodes = useMemo(() => {
    const nodePositions: [number, number, number][] = [];
    for (let i = 0; i < 20; i++) {
      nodePositions.push([
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6
      ]);
    }
    return nodePositions;
  }, []);

  const connections = useMemo(() => {
    const lines: { start: [number, number, number]; end: [number, number, number] }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = Math.sqrt(
          Math.pow(nodes[i][0] - nodes[j][0], 2) +
          Math.pow(nodes[i][1] - nodes[j][1], 2) +
          Math.pow(nodes[i][2] - nodes[j][2], 2)
        );
        if (distance < 3) {
          lines.push({ start: nodes[i], end: nodes[j] });
        }
      }
    }
    return lines;
  }, [nodes]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      {nodes.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} />
        </mesh>
      ))}
      {connections.map((conn, i) => (
        <ConnectionLine key={i} start={conn.start} end={conn.end} />
      ))}
    </group>
  );
};

const ConnectionLine = ({ start, end }: { start: [number, number, number]; end: [number, number, number] }) => {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([...start, ...end]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [start, end]);

  return (
    <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.3 }))} />
  );
};

const CentralOrb = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.3;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.1);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Glow effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.1} />
      </mesh>
      
      {/* Main orb */}
      <Sphere args={[1.5, 64, 64]} ref={meshRef}>
        <MeshDistortMaterial
          color="#0f172a"
          emissive="#22d3ee"
          emissiveIntensity={0.2}
          speed={4}
          distort={0.3}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>
      
      {/* Inner rings */}
      <Torus args={[2, 0.02, 16, 100]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} />
      </Torus>
      <Torus args={[2.3, 0.015, 16, 100]} rotation={[Math.PI / 3, Math.PI / 4, 0]}>
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.4} />
      </Torus>
      <Torus args={[2.6, 0.01, 16, 100]} rotation={[Math.PI / 4, Math.PI / 2, 0]}>
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.3} />
      </Torus>
    </group>
  );
};

export const Scene3D = () => {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#22d3ee" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#a855f7" />
        
        <Stars radius={50} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />
        
        <CentralOrb />
        <NeuralNetwork />
        <ParticleField />
        
        {/* Floating shapes around */}
        <FloatingShape position={[-4, 2, -3]} color="#22d3ee" speed={1.2} scale={0.6} shape="icosahedron" />
        <FloatingShape position={[4, -1, -2]} color="#a855f7" speed={0.8} scale={0.5} shape="box" />
        <FloatingShape position={[-3, -2, 1]} color="#22d3ee" speed={1.5} scale={0.4} shape="torus" />
        <FloatingShape position={[3, 2, 2]} color="#a855f7" speed={1} scale={0.5} shape="sphere" />
        <FloatingShape position={[0, 3, -4]} color="#22d3ee" speed={0.7} scale={0.3} shape="icosahedron" />
        <FloatingShape position={[-5, 0, 0]} color="#a855f7" speed={1.3} scale={0.4} shape="box" />
      </Canvas>
    </div>
  );
};
