import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "@iwsdk/core";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CollectEffect {
  /** Three.js objects to add to the scene (positioned by OrbSystem) */
  objects: Object3D[];
  /** Total effect duration in seconds */
  duration: number;
  /** Called each frame with t in [0..1] */
  update(t: number): void;
}

export interface OrbStyle {
  id: string;
  name: string;
  /** Build the orb mesh (unique instance per pool slot) */
  createMesh(): Mesh;
  /** Animate the orb each frame (no allocations) */
  update(mesh: Object3D, time: number): void;
  /** Create a burst effect at orb's position (OrbSystem positions the objects) */
  createCollectEffect(): CollectEffect;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class OrbStyleRegistry {
  private map: Map<string, OrbStyle> = new Map();
  private order: string[] = [];

  register(style: OrbStyle): this {
    if (!this.map.has(style.id)) this.order.push(style.id);
    this.map.set(style.id, style);
    return this;
  }

  unregister(id: string): this {
    this.map.delete(id);
    this.order = this.order.filter((s) => s !== id);
    return this;
  }

  get(id: string): OrbStyle | undefined {
    return this.map.get(id);
  }

  list(): OrbStyle[] {
    return this.order.map((id) => this.map.get(id)!);
  }

  get size(): number {
    return this.map.size;
  }
}

/** Global registry — add / remove styles here to change what spawns */
export const orbStyleRegistry = new OrbStyleRegistry();

/**
 * Focus testing on a single orb style.
 *
 * Set to any registered style ID to make every pool slot use that style:
 *   ACTIVE_STYLE = "blue-zap"
 *   ACTIVE_STYLE = "orange-pulse"
 *   ACTIVE_STYLE = "purple-plasma"
 *   ACTIVE_STYLE = "green-matrix"
 *   ACTIVE_STYLE = "white-tesla"
 *   ACTIVE_STYLE = "gold-nova"
 *   ACTIVE_STYLE = "red-fractal"
 *   ACTIVE_STYLE = "cyan-hologram"
 *   ACTIVE_STYLE = "rainbow-spectrum"
 *   ACTIVE_STYLE = "void-collapse"
 *
 * Set to null to cycle through all registered styles round-robin (default).
 */
export let ACTIVE_STYLE: string | null = null;

// ─── Shared geometry ──────────────────────────────────────────────────────────

const ORB_GEO = new SphereGeometry(0.13, 16, 12);

// ─── Effect helpers ───────────────────────────────────────────────────────────

/** Straight line segments shooting outward from origin (zap / arc effect) */
function makeZapBurst(
  color: number,
  count: number,
  duration: number,
  maxLen: number,
  biasForward = true,
): CollectEffect {
  const positions = new Float32Array(count * 6);
  const dirs: Float32Array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    let x = Math.sin(phi) * Math.cos(theta);
    let y = Math.sin(phi) * Math.sin(theta);
    let z = Math.cos(phi);
    if (biasForward) z = Math.abs(z); // shoot toward camera (+Z)
    const len = Math.sqrt(x * x + y * y + z * z);
    dirs[i * 3] = x / len;
    dirs[i * 3 + 1] = y / len;
    dirs[i * 3 + 2] = z / len;
  }
  const attr = new BufferAttribute(positions, 3);
  const geo = new BufferGeometry();
  geo.setAttribute("position", attr);
  const mat = new LineBasicMaterial({
    color: new Color(color),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const lines = new LineSegments(geo, mat);

  return {
    objects: [lines],
    duration,
    update(t: number) {
      const arr = attr.array as Float32Array;
      const l = t * maxLen;
      for (let i = 0; i < count; i++) {
        // start stays at 0,0,0
        arr[i * 6 + 3] = dirs[i * 3] * l;
        arr[i * 6 + 4] = dirs[i * 3 + 1] * l;
        arr[i * 6 + 5] = dirs[i * 3 + 2] * l;
      }
      attr.needsUpdate = true;
      mat.opacity = Math.pow(1 - t, 1.5);
    },
  };
}

/** Flat ring that expands and fades */
function makeRingExpand(
  color: number,
  duration: number,
  endScale = 10,
): CollectEffect {
  const geo = new RingGeometry(0.09, 0.16, 32);
  const mat = new MeshStandardMaterial({
    color: new Color(color),
    emissive: new Color(color),
    emissiveIntensity: 2.5,
    transparent: true,
    depthWrite: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const ring = new Mesh(geo, mat);
  return {
    objects: [ring],
    duration,
    update(t: number) {
      const s = 1 + (endScale - 1) * t;
      ring.scale.setScalar(s);
      mat.opacity = 1 - t;
      mat.emissiveIntensity = 2.5 * (1 - t);
    },
  };
}

/** Sphere of outward-flying points (particle scatter) */
function makeParticleScatter(
  color: number,
  count: number,
  duration: number,
  maxDist: number,
): CollectEffect {
  const positions = new Float32Array(count * 3);
  const dirs = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dirs[i * 3] = Math.sin(phi) * Math.cos(theta);
    dirs[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
    dirs[i * 3 + 2] = Math.cos(phi);
  }
  const attr = new BufferAttribute(positions, 3);
  const geo = new BufferGeometry();
  geo.setAttribute("position", attr);
  const mat = new PointsMaterial({
    color: new Color(color),
    size: 0.025,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new Points(geo, mat);
  return {
    objects: [pts],
    duration,
    update(t: number) {
      const arr = attr.array as Float32Array;
      const d = t * maxDist;
      // Ease out: fast start, slow end
      const ease = 1 - Math.pow(1 - t, 2);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = dirs[i * 3] * ease * maxDist;
        arr[i * 3 + 1] = dirs[i * 3 + 1] * ease * maxDist;
        arr[i * 3 + 2] = dirs[i * 3 + 2] * ease * maxDist;
      }
      attr.needsUpdate = true;
      mat.opacity = 1 - t * t;
      void d;
    },
  };
}

// ─── STYLE 1 — Blue Zap ───────────────────────────────────────────────────────
// Fizzy cyan-blue orb with buzzing vertex displacement. Collects by zapping
// electric lines outward toward the player.

const _blueZapVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    float buzz = sin(position.y * 25.0 + uTime * 20.0) * 0.008
               * sin(position.x * 20.0 + uTime * 17.0);
    vec4 mvPos = modelViewMatrix * vec4(position + normal * buzz, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;
const _blueZapFrag = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  void main() {
    vec3 vd = normalize(vViewPos);
    float fresnel = pow(1.0 - abs(dot(vNormal, vd)), 1.8);
    float flick = 0.7 + 0.3 * sin(uTime * 28.0) * sin(uTime * 19.3 + 1.1);
    vec3 col = mix(vec3(0.0, 0.4, 1.0), vec3(0.6, 0.95, 1.0), fresnel)
             * (1.4 + fresnel) * flick;
    gl_FragColor = vec4(col, 1.0);
  }
`;

orbStyleRegistry.register({
  id: "blue-zap",
  name: "Blue Zap",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _blueZapVert,
        fragmentShader: _blueZapFrag,
        uniforms: { uTime: { value: 0 } },
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
    mesh.rotation.y += 0.012;
    mesh.rotation.x += 0.006;
  },
  createCollectEffect(): CollectEffect {
    return makeZapBurst(0x44aaff, 14, 0.45, 0.7, true);
  },
});

// ─── STYLE 2 — Orange Pulse ───────────────────────────────────────────────────
// Warm amber orb that breathes slowly. Collects with a radiant expanding ring.

orbStyleRegistry.register({
  id: "orange-pulse",
  name: "Orange Pulse",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new MeshStandardMaterial({
        color: new Color(0xff6a00),
        emissive: new Color(0xff4400),
        emissiveIntensity: 1.2,
        roughness: 0.2,
        metalness: 0.15,
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    const mat = (mesh as Mesh).material as MeshStandardMaterial;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.5);
    mat.emissiveIntensity = 0.8 + pulse * 1.2;
    const s = 1 + pulse * 0.06;
    mesh.scale.setScalar(s);
    mesh.rotation.y += 0.009;
  },
  createCollectEffect(): CollectEffect {
    // Three overlapping rings, slightly staggered
    const r1 = makeRingExpand(0xff6a00, 0.55, 8);
    const r2 = makeRingExpand(0xffaa00, 0.55, 5);
    const r3 = makeRingExpand(0xff3300, 0.55, 11);
    r2.objects[0].rotation.x = Math.PI * 0.3;
    r3.objects[0].rotation.y = Math.PI * 0.5;
    return {
      objects: [...r1.objects, ...r2.objects, ...r3.objects],
      duration: 0.55,
      update(t: number) {
        r1.update(t);
        r2.update(Math.max(0, t - 0.05));
        r3.update(Math.max(0, t - 0.1));
      },
    };
  },
});

// ─── STYLE 3 — Purple Plasma ──────────────────────────────────────────────────
// Swirling plasma surface shader with noise-driven color cycling.
// Collects by scattering a spiral of violet particles.

const _plasmaVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const _plasmaFrag = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  void main() {
    vec2 uv = vUv * 3.0;
    float n = noise(uv + uTime * 0.9) * 0.5 + noise(uv * 2.0 - uTime * 0.6) * 0.5;
    float ang = atan(vUv.y - 0.5, vUv.x - 0.5) + uTime * 0.8;
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(n + ang * 0.25) + vec3(0.0,0.33,0.67)));
    col = mix(vec3(0.3,0.0,0.6), vec3(1.0,0.2,1.0), col);
    gl_FragColor = vec4(col * 2.0, 1.0);
  }
`;

orbStyleRegistry.register({
  id: "purple-plasma",
  name: "Purple Plasma",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _plasmaVert,
        fragmentShader: _plasmaFrag,
        uniforms: { uTime: { value: 0 } },
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
    mesh.rotation.y += 0.008;
  },
  createCollectEffect(): CollectEffect {
    return makeParticleScatter(0xcc44ff, 60, 0.6, 0.9);
  },
});

// ─── STYLE 4 — Green Matrix ───────────────────────────────────────────────────
// Digital grid/scanline shader in hacker-green. Collects with a pixel dissolve
// effect — a burst of tiny glowing cubes.

const _matrixVert = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const _matrixFrag = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  uniform float uTime;
  void main() {
    vec2 grid = abs(fract(vPos.xy * 9.0 + uTime * 0.4) - 0.5);
    float lines = min(grid.x, grid.y);
    float glow = smoothstep(0.12, 0.0, lines);
    float scan = 0.4 + 0.6 * step(0.0, sin(vPos.y * 22.0 + uTime * 6.0));
    vec3 col = vec3(0.0, 1.0, 0.35) * (glow * 2.5 + scan * 0.4);
    gl_FragColor = vec4(col, 1.0);
  }
`;

orbStyleRegistry.register({
  id: "green-matrix",
  name: "Green Matrix",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _matrixVert,
        fragmentShader: _matrixFrag,
        uniforms: { uTime: { value: 0 } },
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
  },
  createCollectEffect(): CollectEffect {
    return makeParticleScatter(0x00ff44, 80, 0.5, 0.7);
  },
});

// ─── STYLE 5 — White Tesla Arc ────────────────────────────────────────────────
// Silver-white orb with sharp arc flickers on the surface. Collects with
// jagged multi-directional lightning.

const _teslaVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;
const _teslaFrag = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  void main() {
    vec3 vd = normalize(vViewPos);
    float fresnel = pow(1.0 - abs(dot(vNormal, vd)), 2.0);
    // Arc flicker: two high-freq sinusoids create sparse bright sparks
    float arc = step(0.965, sin(vNormal.x * 32.0 + uTime * 45.0)
                           * sin(vNormal.y * 27.0 + uTime * 38.0));
    vec3 col = vec3(0.75, 0.88, 1.0) * (fresnel * 2.0 + arc * 4.0 + 0.15);
    gl_FragColor = vec4(col, 1.0);
  }
`;

orbStyleRegistry.register({
  id: "white-tesla",
  name: "White Tesla Arc",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _teslaVert,
        fragmentShader: _teslaFrag,
        uniforms: { uTime: { value: 0 } },
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
    mesh.rotation.y += 0.015;
    mesh.rotation.z -= 0.005;
  },
  createCollectEffect(): CollectEffect {
    // Two bursts from slightly different times for a chaotic arc feel
    const b1 = makeZapBurst(0xaaddff, 10, 0.4, 0.65, false);
    const b2 = makeZapBurst(0xffffff, 6, 0.35, 0.5, false);
    return {
      objects: [...b1.objects, ...b2.objects],
      duration: 0.4,
      update(t: number) {
        b1.update(t);
        b2.update(Math.min(1, t * 1.2));
      },
    };
  },
});

// ─── STYLE 6 — Gold Nova ──────────────────────────────────────────────────────
// Glowing gold orb with slow rotation. Collects with a starburst of rings.

orbStyleRegistry.register({
  id: "gold-nova",
  name: "Gold Nova",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new MeshStandardMaterial({
        color: new Color(0xffd700),
        emissive: new Color(0xff8800),
        emissiveIntensity: 1.5,
        roughness: 0.1,
        metalness: 0.8,
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    mesh.rotation.y = time * 1.2;
    mesh.rotation.x = Math.sin(time * 0.7) * 0.3;
    const mat = (mesh as Mesh).material as MeshStandardMaterial;
    mat.emissiveIntensity = 1.2 + 0.6 * Math.sin(time * 4.0);
  },
  createCollectEffect(): CollectEffect {
    // 6 rings at different rotations — starburst
    const rings = Array.from({ length: 6 }, (_, i) => {
      const r = makeRingExpand(i % 2 === 0 ? 0xffd700 : 0xff8800, 0.5, 7);
      r.objects[0].rotation.set(
        (i / 6) * Math.PI,
        (i / 6) * Math.PI * 0.5,
        0,
      );
      return r;
    });
    return {
      objects: rings.flatMap((r) => r.objects),
      duration: 0.5,
      update(t: number) {
        rings.forEach((r, i) => r.update(Math.max(0, t - i * 0.015)));
      },
    };
  },
});

// ─── STYLE 7 — Red Fractal Core ───────────────────────────────────────────────
// Deep red orb with an inverted glow: dark edges, blazing inner core.
// Collects by hurling glowing red shards.

const _redCoreVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;
const _redCoreFrag = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5); }
  void main() {
    vec3 vd = normalize(vViewPos);
    float facing = abs(dot(vNormal, vd));  // 1.0 at center, 0 at edge
    // Inner glow: brightest at the core
    float core = pow(facing, 0.6);
    float flick = 0.85 + 0.15 * sin(uTime * 22.0 + hash(vNormal) * 6.28);
    vec3 col = mix(vec3(0.7, 0.0, 0.0), vec3(1.0, 0.5, 0.1), core) * (core * 2.5 + 0.3) * flick;
    gl_FragColor = vec4(col, 1.0);
  }
`;

orbStyleRegistry.register({
  id: "red-fractal",
  name: "Red Fractal Core",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _redCoreVert,
        fragmentShader: _redCoreFrag,
        uniforms: { uTime: { value: 0 } },
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
    mesh.rotation.z += 0.012;
  },
  createCollectEffect(): CollectEffect {
    const b = makeZapBurst(0xff2200, 16, 0.5, 0.8, false);
    const p = makeParticleScatter(0xff4400, 40, 0.5, 0.6);
    return {
      objects: [...b.objects, ...p.objects],
      duration: 0.5,
      update(t: number) {
        b.update(t);
        p.update(t);
      },
    };
  },
});

// ─── STYLE 8 — Cyan Hologram ──────────────────────────────────────────────────
// Translucent holographic orb with scrolling scanlines and a bright rim.
// Collects with a cascade of expanding rings.

const _holoVert = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const _holoFrag = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  uniform float uTime;
  void main() {
    float scan = step(0.0, sin(vWorldPos.y * 45.0 + uTime * 4.0));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(vNormal, viewDir)), 1.8);
    float alpha = (scan * 0.55 + rim * 0.9) * (0.6 + 0.4 * sin(uTime * 1.5));
    vec3 col = vec3(0.0, 0.9, 1.0) * (rim * 2.5 + 0.4);
    gl_FragColor = vec4(col, clamp(alpha, 0.1, 1.0));
  }
`;

orbStyleRegistry.register({
  id: "cyan-hologram",
  name: "Cyan Hologram",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _holoVert,
        fragmentShader: _holoFrag,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
    mesh.rotation.y += 0.01;
  },
  createCollectEffect(): CollectEffect {
    const rings = Array.from({ length: 4 }, (_, i) => {
      const r = makeRingExpand(0x00eeff, 0.5, 6 + i * 2);
      r.objects[0].rotation.x = i * (Math.PI / 4);
      return r;
    });
    return {
      objects: rings.flatMap((r) => r.objects),
      duration: 0.5,
      update(t: number) {
        rings.forEach((r, i) => r.update(Math.max(0, t - i * 0.06)));
      },
    };
  },
});

// ─── STYLE 9 — Rainbow Spectrum ───────────────────────────────────────────────
// Continuously cycles through the full color spectrum. Collects with a
// brilliant rainbow ring burst.

orbStyleRegistry.register({
  id: "rainbow-spectrum",
  name: "Rainbow Spectrum",
  createMesh() {
    const mat = new MeshStandardMaterial({
      color: new Color(0xff0000),
      emissive: new Color(0xff0000),
      emissiveIntensity: 1.6,
      roughness: 0.12,
      metalness: 0.2,
    });
    return new Mesh(ORB_GEO, mat);
  },
  update(mesh: Object3D, time: number) {
    const mat = (mesh as Mesh).material as MeshStandardMaterial;
    // Cycle hue over 3 seconds
    const hue = (time * 0.33) % 1;
    mat.color.setHSL(hue, 1.0, 0.6);
    mat.emissive.setHSL(hue, 1.0, 0.4);
    mat.emissiveIntensity = 1.4 + 0.4 * Math.sin(time * 5.0);
    mesh.scale.setScalar(1 + 0.04 * Math.sin(time * 6.0));
    mesh.rotation.y += 0.011;
    mesh.rotation.x = Math.sin(time * 0.9) * 0.2;
  },
  createCollectEffect(): CollectEffect {
    // 7 rings, one per rainbow colour
    const hues = [0, 0.08, 0.16, 0.33, 0.55, 0.67, 0.8];
    const rings = hues.map((h, i) => {
      const c = new Color().setHSL(h, 1, 0.6);
      const r = makeRingExpand(c.getHex(), 0.55, 5 + i * 1.2);
      r.objects[0].rotation.x = (i / 7) * Math.PI * 0.6;
      return r;
    });
    return {
      objects: rings.flatMap((r) => r.objects),
      duration: 0.55,
      update(t: number) {
        rings.forEach((r, i) => r.update(Math.max(0, t - i * 0.02)));
      },
    };
  },
});

// ─── STYLE 10 — Void Collapse ─────────────────────────────────────────────────
// Black orb with a blazing violet/magenta rim. Collects by imploding to
// nothing then exploding outward in dark energy.

const _voidVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;
const _voidFrag = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  void main() {
    vec3 vd = normalize(vViewPos);
    float fresnel = pow(1.0 - abs(dot(vNormal, vd)), 1.3);
    float pulse = 0.6 + 0.4 * sin(uTime * 1.8);
    vec3 rimColor = mix(vec3(0.6, 0.0, 1.0), vec3(1.0, 0.0, 0.5), pulse);
    // Very dark interior, brilliant edge
    vec3 col = rimColor * fresnel * 4.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

orbStyleRegistry.register({
  id: "void-collapse",
  name: "Void Collapse",
  createMesh() {
    return new Mesh(
      ORB_GEO,
      new ShaderMaterial({
        vertexShader: _voidVert,
        fragmentShader: _voidFrag,
        uniforms: { uTime: { value: 0 } },
      }),
    );
  },
  update(mesh: Object3D, time: number) {
    ((mesh as Mesh).material as ShaderMaterial).uniforms.uTime.value = time;
    mesh.rotation.y += 0.006;
    mesh.rotation.z -= 0.004;
  },
  createCollectEffect(): CollectEffect {
    // Phase 1 (t 0–0.35): implode — shrink a dark torus to nothing
    // Phase 2 (t 0.35–1.0): explode — violet particles burst out
    const torusGeo = new TorusGeometry(0.18, 0.05, 8, 32);
    const torusMat = new MeshStandardMaterial({
      color: new Color(0x220044),
      emissive: new Color(0x8800ff),
      emissiveIntensity: 3.0,
      transparent: true,
      depthWrite: false,
    });
    const torus = new Mesh(torusGeo, torusMat);

    const burst = makeParticleScatter(0xaa00ff, 70, 0.65, 1.0);

    return {
      objects: [torus, ...burst.objects],
      duration: 0.65,
      update(t: number) {
        if (t < 0.35) {
          // Implode
          const it = t / 0.35;
          torus.visible = true;
          torus.scale.setScalar(1 - it);
          torusMat.opacity = 1 - it;
          torusMat.emissiveIntensity = 3 * (1 - it * 0.5);
          torus.rotation.y = it * Math.PI * 3;
        } else {
          torus.visible = false;
          const bt = (t - 0.35) / 0.65;
          burst.update(bt);
        }
      },
    };
  },
});
