import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "../../utils/cn";

/* ============================================================
   NEXUS CyberGlobe — premium rotating 3D globe hero.
   Lazy-cheap: a wet-grid canvas texture on one sphere + a few
   nodes/arcs/particles. Paused off-screen & under reduced motion.
   ============================================================ */

const GRID_RADIUS = 1;
const NODE_COUNT = 34;
const ARC_COUNT = 5;

// One full revolution every 24s — constant angular velocity, decoupled from
// React renders (applied to the THREE object directly in useFrame).
const ROTATION_SPEED = (Math.PI * 2) / 24;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randOnSphere(rng: () => number): THREE.Vector3 {
  const u = Math.acos(2 * rng() - 1);
  const v = rng() * Math.PI * 2;
  return new THREE.Vector3(
    Math.sin(u) * Math.cos(v),
    Math.cos(u),
    Math.sin(u) * Math.sin(v)
  );
}

function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function makeGridTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Meridians (vertical)
  ctx!.strokeStyle = "rgba(103,232,249,0.3)";
  for (let i = 0; i < 12; i++) {
    ctx!.beginPath();
    ctx!.moveTo((i / 12) * size, 0);
    ctx!.lineTo((i / 12) * size, size);
    ctx!.stroke();
  }
  // Prime meridian highlight
  ctx!.beginPath();
  ctx!.strokeStyle = "rgba(56,189,248,0.8)";
  ctx!.lineWidth = 1.2;
  ctx!.moveTo(size / 2, 0);
  ctx!.lineTo(size / 2, size);
  ctx!.stroke();

  // Parallels (horizontal)
  ctx!.strokeStyle = "rgba(103,232,249,0.32)";
  for (let i = 1; i < 8; i++) {
    ctx!.beginPath();
    ctx!.moveTo(0, (i / 8) * size);
    ctx!.lineTo(size, (i / 8) * size);
    ctx!.stroke();
  }
  // Equator highlight
  ctx!.beginPath();
  ctx!.strokeStyle = "rgba(56,189,248,0.85)";
  ctx!.lineWidth = 1.4;
  ctx!.moveTo(0, size / 2);
  ctx!.lineTo(size, size / 2);
  ctx!.stroke();

  // Embedded faint node specks baked into the map
  const rng = mulberry32(2019);
  ctx!.shadowColor = "rgba(125,211,252,0.9)";
  ctx!.shadowBlur = 6;
  for (let i = 0; i < 46; i++) {
    const x = (rng() * 0.96 + 0.02) * size;
    const y = (rng() * 0.96 + 0.02) * size;
    ctx!.beginPath();
    ctx!.fillStyle = "rgba(125,211,252,0.8)";
    ctx!.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx!.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  return tex;
}

function makeDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx!.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(186,230,253,0.85)");
  g.addColorStop(1, "rgba(56,189,248,0)");
  ctx!.fillStyle = g;
  ctx!.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface GlobeInnerProps {
  parallax: MutableRefObject<{ x: number; y: number }>;
}

function GlobeInner({ parallax }: GlobeInnerProps) {
  const mats = useMemo(() => {
    const gridTex = makeGridTexture();
    const dotTex = makeDotTexture();
    const rng = mulberry32(20260417);

    // ---- node positions on the sphere ----
    const nodeVectors: THREE.Vector3[] = [];
    const nodePositions: number[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const p = randOnSphere(rng).multiplyScalar(GRID_RADIUS * 1.006);
      nodeVectors.push(p.clone());
      nodePositions.push(p.x, p.y, p.z);
    }

    // ---- groups & meshes ----
    const tilt = new THREE.Group();
    const globe = new THREE.Group();

    const darkMat = new THREE.MeshBasicMaterial({ color: 0x04070c, transparent: true, opacity: 0.92 });
    const darkMesh = new THREE.Mesh(new THREE.SphereGeometry(GRID_RADIUS, 48, 32), darkMat);

    const gridMat = new THREE.MeshBasicMaterial({
      map: gridTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const gridMesh = new THREE.Mesh(new THREE.SphereGeometry(GRID_RADIUS * 1.004, 48, 32), gridMat);
    gridMesh.renderOrder = 1;

    const nodesGeom = new THREE.BufferGeometry();
    nodesGeom.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
    const nodesMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.028,
      map: dotTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const nodes = new THREE.Points(nodesGeom, nodesMat);

    // ---- connection arcs (CatmullRom slightly lifted above surface) ----
    const arcs: THREE.Line[] = [];
    for (let i = 0; i < ARC_COUNT; i++) {
      const a = nodeVectors[Math.floor(rng() * nodeVectors.length)];
      const b = nodeVectors[Math.floor(rng() * nodeVectors.length)];
      const mid = a
        .clone()
        .add(b)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(GRID_RADIUS * (1.22 + 0.16 * Math.abs(a.z - b.z)));
      const pts = new THREE.CatmullRomCurve3([a.clone(), mid, b.clone()]).getPoints(48);
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      arcs.push(new THREE.Line(geom, mat));
    }

    globe.add(darkMesh, gridMesh, nodes, ...arcs);
    tilt.add(globe);

    // ---- scattered orbital particles (two tilted rings) ----
    const orbitPositions: number[] = [];
    const tiltMat = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.45, 0, 0.35));
    for (let ring = 0; ring < 2; ring++) {
      const r = 1.32 + ring * 0.16;
      const count = 26 + ring * 8;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const p = new THREE.Vector3(
          Math.cos(ang) * r,
          Math.sin(ang) * r * 0.42,
          (rng() - 0.5) * 0.18
        ).applyMatrix4(tiltMat);
        orbitPositions.push(p.x, p.y, p.z);
      }
    }
    const orbitGeom = new THREE.BufferGeometry();
    orbitGeom.setAttribute("position", new THREE.Float32BufferAttribute(orbitPositions, 3));
    const orbitMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.016,
      map: dotTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const orbit = new THREE.Points(orbitGeom, orbitMat);

    const disposables: { dispose(): void }[] = [
      gridTex,
      dotTex,
      darkMat,
      gridMat,
      darkMesh.geometry,
      gridMesh.geometry,
      nodesGeom,
      nodesMat,
      orbitGeom,
      orbitMat,
    ];
    for (const line of arcs) {
      disposables.push(line.geometry, line.material as THREE.Material);
    }

    return {
      tilt,
      globe,
      orbit,
      nodesMat,
      arcs,
      disposables,
    };
  }, []);

  useEffect(() => {
    return () => {
      mats.disposables.forEach((d) => d.dispose());
    };
  }, [mats]);

  useFrame((state, delta) => {
    // Continuous rotation at a perfectly constant angular velocity. Set from the
    // clock's absolute elapsed time (not accumulated setState) so it never
    // restarts, jumps, or accelerates on React re-renders.
    mats.globe.rotation.y = state.clock.elapsedTime * ROTATION_SPEED;
    // subtle parallax tilt / lerp toward pointer
    const k = Math.min(1, delta * 6);
    mats.tilt.rotation.x += (parallax.current.y * 0.22 - mats.tilt.rotation.x) * k;
    mats.tilt.rotation.y += (parallax.current.x * -0.3 - mats.tilt.rotation.y) * k;
    const t = state.clock.elapsedTime;
    mats.nodesMat.opacity = 0.58 + 0.28 * Math.sin(t * 1.1);
    mats.orbit.rotation.z = t * 0.09;
    mats.arcs.forEach((line, i) => {
      const phase = t * 0.5 + i * 1.9;
      (line.material as THREE.LineBasicMaterial).opacity = 0.15 + 0.45 * Math.abs(Math.sin(phase));
    });
  });

  return (
    <>
      <primitive object={mats.tilt} />
      <primitive object={mats.orbit} />
    </>
  );
}

function CssFallbackGlobe() {
  return (
    <div className="cb-fallback" aria-hidden="true">
      <span className="cb-fb halo" />
      <span className="cb-fb grid-a" />
      <span className="cb-fb grid-b" />
      <span className="cb-fb grid-c" />
    </div>
  );
}

interface CyberGlobeProps {
  className?: string;
}

export function CyberGlobe({ className }: CyberGlobeProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const parallax = useRef({ x: 0, y: 0 });
  const [webgl] = useState<boolean>(() => hasWebGL());
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onMq);

    const el = wrapRef.current;
    let io: IntersectionObserver | undefined;
    if (el && "IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? true), {
        rootMargin: "48px",
      });
      io.observe(el);
    }
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mq.removeEventListener("change", onMq);
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const running = webgl && !reduced && inView && !hidden;

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    parallax.current.x = Math.max(-1, Math.min(1, x * 2 - 1));
    parallax.current.y = Math.max(-1, Math.min(1, y * 2 - 1));
  };

  return (
    <div
      ref={wrapRef}
      className={cn("cyber-globe relative w-full h-full select-none", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        parallax.current.x = 0;
        parallax.current.y = 0;
      }}
      onMouseMove={onMouseMove}
    >
      {webgl ? (
        <Canvas
          dpr={[1, 2]}
          frameloop={running ? "always" : "demand"}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ position: [0, 0, 3.25], fov: 45 }}
          style={{ position: "absolute", inset: 0 }}
          aria-hidden="true"
        >
          <GlobeInner parallax={parallax} />
        </Canvas>
      ) : (
        <CssFallbackGlobe />
      )}
      <div className={cn("cb-glow", hovered && "cb-glow-on")} aria-hidden="true" />
      <span className="cb-label" aria-hidden="true">
        N
      </span>
    </div>
  );
}