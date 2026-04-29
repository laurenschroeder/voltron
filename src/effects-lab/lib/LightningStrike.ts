// LightningStrike from three.js examples (vendored, typed)
// Original: three/examples/jsm/geometries/LightningStrike.js

import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  MathUtils,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
import { SimplexNoise } from './SimplexNoise.js';

interface RandomGenerator {
  random(): number;
  getSeed(): number;
  setSeed(seed: number): void;
}

interface RayParameters {
  sourceOffset: Vector3;
  destOffset: Vector3;
  timeScale: number;
  roughness: number;
  straightness: number;
  up0: Vector3;
  up1: Vector3;
  radius0: number;
  radius1: number;
  radius0Factor: number;
  radius1Factor: number;
  minRadius: number;
  isEternal: boolean;
  birthTime: number;
  deathTime: number;
  propagationTimeFactor: number;
  vanishingTimeFactor: number;
  subrayPeriod: number;
  subrayDutyCycle: number;
  maxIterations: number;
  isStatic: boolean;
  ramification: number;
  maxSubrayRecursion: number;
  recursionProbability: number;
  generateUVs: boolean;
  randomGenerator?: RandomGenerator;
  noiseSeed?: number;
  maxSubrays?: number;
  onDecideSubrayCreation?: (segment: any, strike: LightningStrike) => void;
  onSubrayCreation?: (segment: any, parentSubray: any, childSubray: any, strike: LightningStrike) => void;
}

interface Subray {
  seed: number;
  maxIterations: number;
  recursion: number;
  pos0: Vector3;
  pos1: Vector3;
  linPos0: Vector3;
  linPos1: Vector3;
  up0: Vector3;
  up1: Vector3;
  radius0: number;
  radius1: number;
  birthTime: number;
  deathTime: number;
  timeScale: number;
  roughness: number;
  straightness: number;
  propagationTimeFactor: number;
  vanishingTimeFactor: number;
  endPropagationTime: number;
  beginVanishingTime: number;
}

interface Segment {
  iteration: number;
  pos0: Vector3;
  pos1: Vector3;
  linPos0: Vector3;
  linPos1: Vector3;
  up0: Vector3;
  up1: Vector3;
  radius0: number;
  radius1: number;
  fraction0: number;
  fraction1: number;
  positionVariationFactor: number;
}

class LightningStrike extends BufferGeometry {
  static RAY_INITIALIZED = 0;
  static RAY_UNBORN = 1;
  static RAY_PROPAGATING = 2;
  static RAY_STEADY = 3;
  static RAY_VANISHING = 4;
  static RAY_EXTINGUISHED = 5;
  static COS30DEG = Math.cos(30 * Math.PI / 180);
  static SIN30DEG = Math.sin(30 * Math.PI / 180);

  isLightningStrike = true;
  override type = 'LightningStrike';
  visible = true;

  rayParameters!: RayParameters;
  state!: number;
  maxIterations!: number;
  isStatic!: boolean;
  ramification!: number;
  maxSubrayRecursion!: number;
  recursionProbability!: number;
  generateUVs!: boolean;
  randomGenerator!: RandomGenerator;
  seedGenerator!: any;
  maxSubrays!: number;
  maxRaySegments!: number;
  subrays!: Subray[];
  raySegments!: Segment[];
  time!: number;
  timeFraction!: number;
  currentSegmentCallback!: ((segment: Segment) => void) | null;
  currentCreateTriangleVertices!: (pos: Vector3, up: Vector3, forwards: Vector3, radius: number, u: number) => void;
  numSubrays!: number;
  currentSubray!: Subray | null;
  currentSegmentIndex!: number;
  isInitialSegment!: boolean;
  subrayProbability!: number;
  currentVertex!: number;
  currentIndex!: number;
  currentCoordinate!: number;
  currentUVCoordinate!: number;
  vertices!: Float32Array;
  uvs!: Float32Array | null;
  indices!: Uint32Array;
  positionAttribute!: Float32BufferAttribute;
  uvsAttribute!: Float32BufferAttribute | null;

  onDecideSubrayCreation!: (segment: Segment, strike: LightningStrike) => void;
  onSubrayCreation!: (segment: Segment, parentSubray: Subray, childSubray: Subray, strike: LightningStrike) => void;
  subrayConePosition!: (segment: Segment, parentSubray: Subray, childSubray: Subray, heightFactor: number, sideWidthFactor: number, minSideWidthFactor: number) => void;
  subrayCylinderPosition!: (segment: Segment, parentSubray: Subray, childSubray: Subray, heightFactor: number, sideWidthFactor: number, minSideWidthFactor: number) => void;

  private simplexX!: SimplexNoise;
  private simplexY!: SimplexNoise;
  private simplexZ!: SimplexNoise;
  private forwards = new Vector3();
  private forwardsFill = new Vector3();
  private side = new Vector3();
  private down = new Vector3();
  private middlePos = new Vector3();
  private middleLinPos = new Vector3();
  private newPos = new Vector3();
  private vPos = new Vector3();
  private cross1 = new Vector3();

  constructor(rayParameters: Partial<RayParameters> = {}) {
    super();
    this.init(LightningStrike.copyParameters(rayParameters as any, rayParameters as any));
    this.createMesh();
  }

  static createRandomGenerator(): RandomGenerator {
    const numSeeds = 2053;
    const seeds: number[] = [];
    for (let i = 0; i < numSeeds; i++) seeds.push(Math.random());
    const generator: RandomGenerator = {
      currentSeed: 0,
      random() {
        const value = seeds[(this as any).currentSeed];
        (this as any).currentSeed = ((this as any).currentSeed + 1) % numSeeds;
        return value;
      },
      getSeed() { return (this as any).currentSeed / numSeeds; },
      setSeed(seed: number) { (this as any).currentSeed = Math.floor(seed * numSeeds) % numSeeds; },
    } as any;
    return generator;
  }

  static copyParameters(dest: any = {}, source: any = {}): RayParameters {
    const vecCopy = (v: Vector3) => source === dest ? v : v.clone();

    dest.sourceOffset = source.sourceOffset !== undefined ? vecCopy(source.sourceOffset) : new Vector3(0, 100, 0);
    dest.destOffset = source.destOffset !== undefined ? vecCopy(source.destOffset) : new Vector3(0, 0, 0);
    dest.timeScale = source.timeScale ?? 1;
    dest.roughness = source.roughness ?? 0.9;
    dest.straightness = source.straightness ?? 0.7;
    dest.up0 = source.up0 !== undefined ? vecCopy(source.up0) : new Vector3(0, 0, 1);
    dest.up1 = source.up1 !== undefined ? vecCopy(source.up1) : new Vector3(0, 0, 1);
    dest.radius0 = source.radius0 ?? 1;
    dest.radius1 = source.radius1 ?? 1;
    dest.radius0Factor = source.radius0Factor ?? 0.5;
    dest.radius1Factor = source.radius1Factor ?? 0.2;
    dest.minRadius = source.minRadius ?? 0.2;
    dest.isEternal = source.isEternal ?? (source.birthTime === undefined || source.deathTime === undefined);
    dest.birthTime = source.birthTime;
    dest.deathTime = source.deathTime;
    dest.propagationTimeFactor = source.propagationTimeFactor ?? 0.1;
    dest.vanishingTimeFactor = source.vanishingTimeFactor ?? 0.9;
    dest.subrayPeriod = source.subrayPeriod ?? 4;
    dest.subrayDutyCycle = source.subrayDutyCycle ?? 0.6;
    dest.maxIterations = source.maxIterations ?? 9;
    dest.isStatic = source.isStatic ?? false;
    dest.ramification = source.ramification ?? 5;
    dest.maxSubrayRecursion = source.maxSubrayRecursion ?? 3;
    dest.recursionProbability = source.recursionProbability ?? 0.6;
    dest.generateUVs = source.generateUVs ?? false;
    dest.randomGenerator = source.randomGenerator;
    dest.noiseSeed = source.noiseSeed;
    dest.onDecideSubrayCreation = source.onDecideSubrayCreation;
    dest.onSubrayCreation = source.onSubrayCreation;
    return dest;
  }

  update(time: number) {
    if (this.isStatic) return;
    if (this.rayParameters.isEternal || (this.rayParameters.birthTime <= time && time <= this.rayParameters.deathTime)) {
      this.updateMesh(time);
      if (time < this.subrays[0].endPropagationTime) {
        this.state = LightningStrike.RAY_PROPAGATING;
      } else if (time > this.subrays[0].beginVanishingTime) {
        this.state = LightningStrike.RAY_VANISHING;
      } else {
        this.state = LightningStrike.RAY_STEADY;
      }
      this.visible = true;
    } else {
      this.visible = false;
      this.state = time < this.rayParameters.birthTime ? LightningStrike.RAY_UNBORN : LightningStrike.RAY_EXTINGUISHED;
    }
  }

  init(rayParameters: RayParameters) {
    this.rayParameters = rayParameters;
    this.maxIterations = Math.floor(rayParameters.maxIterations);
    rayParameters.maxIterations = this.maxIterations;
    this.isStatic = rayParameters.isStatic;
    this.ramification = Math.floor(rayParameters.ramification);
    rayParameters.ramification = this.ramification;
    this.maxSubrayRecursion = Math.floor(rayParameters.maxSubrayRecursion);
    rayParameters.maxSubrayRecursion = this.maxSubrayRecursion;
    this.recursionProbability = rayParameters.recursionProbability;
    this.generateUVs = rayParameters.generateUVs;

    if (rayParameters.randomGenerator !== undefined) {
      this.randomGenerator = rayParameters.randomGenerator;
      this.seedGenerator = rayParameters.randomGenerator;
      if (rayParameters.noiseSeed !== undefined) this.seedGenerator.setSeed(rayParameters.noiseSeed);
    } else {
      this.randomGenerator = LightningStrike.createRandomGenerator();
      this.seedGenerator = Math;
    }

    if (rayParameters.onDecideSubrayCreation !== undefined) {
      this.onDecideSubrayCreation = rayParameters.onDecideSubrayCreation;
    } else {
      this.createDefaultSubrayCreationCallbacks();
      if (rayParameters.onSubrayCreation !== undefined) {
        this.onSubrayCreation = rayParameters.onSubrayCreation;
      }
    }

    this.state = LightningStrike.RAY_INITIALIZED;
    this.maxSubrays = Math.ceil(1 + Math.pow(this.ramification, Math.max(0, this.maxSubrayRecursion - 1)));
    rayParameters.maxSubrays = this.maxSubrays;
    this.maxRaySegments = 2 * (1 << this.maxIterations);

    this.subrays = [];
    for (let i = 0; i < this.maxSubrays; i++) this.subrays.push(this.createSubray());

    this.raySegments = [];
    for (let i = 0; i < this.maxRaySegments; i++) this.raySegments.push(this.createSegment());

    this.time = 0;
    this.timeFraction = 0;
    this.currentSegmentCallback = null;
    this.currentCreateTriangleVertices = this.generateUVs ? this.createTriangleVerticesWithUVs : this.createTriangleVerticesWithoutUVs;
    this.numSubrays = 0;
    this.currentSubray = null;
    this.currentSegmentIndex = 0;
    this.isInitialSegment = false;
    this.subrayProbability = 0;
    this.currentVertex = 0;
    this.currentIndex = 0;
    this.currentCoordinate = 0;
    this.currentUVCoordinate = 0;
    this.vertices = null!;
    this.uvs = null;
    this.indices = null!;
    this.positionAttribute = null!;
    this.uvsAttribute = null;

    this.simplexX = new SimplexNoise(this.seedGenerator);
    this.simplexY = new SimplexNoise(this.seedGenerator);
    this.simplexZ = new SimplexNoise(this.seedGenerator);

    this.forwards = new Vector3();
    this.forwardsFill = new Vector3();
    this.side = new Vector3();
    this.down = new Vector3();
    this.middlePos = new Vector3();
    this.middleLinPos = new Vector3();
    this.newPos = new Vector3();
    this.vPos = new Vector3();
    this.cross1 = new Vector3();
  }

  createMesh() {
    const maxDrawableSegmentsPerSubRay = 1 << this.maxIterations;
    const maxVerts = 3 * (maxDrawableSegmentsPerSubRay + 1) * this.maxSubrays;
    const maxIndices = 18 * maxDrawableSegmentsPerSubRay * this.maxSubrays;

    this.vertices = new Float32Array(maxVerts * 3);
    this.indices = new Uint32Array(maxIndices);
    if (this.generateUVs) this.uvs = new Float32Array(maxVerts * 2);

    this.fillMesh(0);

    this.setIndex(new Uint32BufferAttribute(this.indices, 1));
    this.positionAttribute = new Float32BufferAttribute(this.vertices, 3);
    this.setAttribute('position', this.positionAttribute);

    if (this.generateUVs) {
      this.uvsAttribute = new Float32BufferAttribute(new Float32Array(this.uvs!), 2);
      this.setAttribute('uv', this.uvsAttribute);
    }

    if (!this.isStatic) {
      this.index!.usage = DynamicDrawUsage;
      this.positionAttribute.usage = DynamicDrawUsage;
      if (this.generateUVs) this.uvsAttribute!.usage = DynamicDrawUsage;
    }

    this.vertices = this.positionAttribute.array as Float32Array;
    this.indices = this.index!.array as Uint32Array;
    if (this.generateUVs) this.uvs = this.uvsAttribute!.array as Float32Array;
  }

  updateMesh(time: number) {
    this.fillMesh(time);
    this.drawRange.count = this.currentIndex;
    this.index!.needsUpdate = true;
    this.positionAttribute.needsUpdate = true;
    if (this.generateUVs) this.uvsAttribute!.needsUpdate = true;
  }

  fillMesh(time: number) {
    const scope = this;
    this.currentVertex = 0;
    this.currentIndex = 0;
    this.currentCoordinate = 0;
    this.currentUVCoordinate = 0;

    this.fractalRay(time, function fillVertices(segment: Segment) {
      const subray = scope.currentSubray!;
      if (time < subray.birthTime) return;

      if (scope.rayParameters.isEternal && subray.recursion === 0) {
        scope.createPrism(segment);
        scope.onDecideSubrayCreation(segment, scope);
      } else if (time < subray.endPropagationTime) {
        if (scope.timeFraction >= segment.fraction0 * subray.propagationTimeFactor) {
          scope.createPrism(segment);
          scope.onDecideSubrayCreation(segment, scope);
        }
      } else if (time < subray.beginVanishingTime) {
        scope.createPrism(segment);
        scope.onDecideSubrayCreation(segment, scope);
      } else {
        if (scope.timeFraction <= subray.vanishingTimeFactor + segment.fraction1 * (1 - subray.vanishingTimeFactor)) {
          scope.createPrism(segment);
        }
        scope.onDecideSubrayCreation(segment, scope);
      }
    });
  }

  addNewSubray(): Subray {
    return this.subrays[this.numSubrays++];
  }

  initSubray(subray: Subray, rayParameters: RayParameters) {
    subray.pos0.copy(rayParameters.sourceOffset);
    subray.pos1.copy(rayParameters.destOffset);
    subray.up0.copy(rayParameters.up0);
    subray.up1.copy(rayParameters.up1);
    subray.radius0 = rayParameters.radius0;
    subray.radius1 = rayParameters.radius1;
    subray.birthTime = rayParameters.birthTime;
    subray.deathTime = rayParameters.deathTime;
    subray.timeScale = rayParameters.timeScale;
    subray.roughness = rayParameters.roughness;
    subray.straightness = rayParameters.straightness;
    subray.propagationTimeFactor = rayParameters.propagationTimeFactor;
    subray.vanishingTimeFactor = rayParameters.vanishingTimeFactor;
    subray.maxIterations = this.maxIterations;
    subray.seed = rayParameters.noiseSeed ?? 0;
    subray.recursion = 0;
  }

  fractalRay(time: number, segmentCallback: (segment: Segment) => void) {
    this.time = time;
    this.currentSegmentCallback = segmentCallback;
    this.numSubrays = 0;
    this.initSubray(this.addNewSubray(), this.rayParameters);

    for (let subrayIndex = 0; subrayIndex < this.numSubrays; subrayIndex++) {
      const subray = this.subrays[subrayIndex];
      this.currentSubray = subray;
      this.randomGenerator.setSeed(subray.seed);

      subray.endPropagationTime = MathUtils.lerp(subray.birthTime, subray.deathTime, subray.propagationTimeFactor);
      subray.beginVanishingTime = MathUtils.lerp(subray.deathTime, subray.birthTime, 1 - subray.vanishingTimeFactor);

      const random1 = this.randomGenerator.random.bind(this.randomGenerator);
      subray.linPos0.set(random1(), random1(), random1()).multiplyScalar(1000);
      subray.linPos1.set(random1(), random1(), random1()).multiplyScalar(1000);

      this.timeFraction = (time - subray.birthTime) / (subray.deathTime - subray.birthTime);
      this.currentSegmentIndex = 0;
      this.isInitialSegment = true;

      const segment = this.getNewSegment();
      segment.iteration = 0;
      segment.pos0.copy(subray.pos0);
      segment.pos1.copy(subray.pos1);
      segment.linPos0.copy(subray.linPos0);
      segment.linPos1.copy(subray.linPos1);
      segment.up0.copy(subray.up0);
      segment.up1.copy(subray.up1);
      segment.radius0 = subray.radius0;
      segment.radius1 = subray.radius1;
      segment.fraction0 = 0;
      segment.fraction1 = 1;
      segment.positionVariationFactor = 1 - subray.straightness;

      this.subrayProbability = this.ramification * Math.pow(this.recursionProbability, subray.recursion) / (1 << subray.maxIterations);
      this.fractalRayRecursive(segment);
    }

    this.currentSegmentCallback = null;
    this.currentSubray = null;
  }

  fractalRayRecursive(segment: Segment) {
    if (segment.iteration >= this.currentSubray!.maxIterations) {
      this.currentSegmentCallback!(segment);
      return;
    }

    this.forwards.subVectors(segment.pos1, segment.pos0);
    let lForwards = this.forwards.length();
    if (lForwards < 0.000001) {
      this.forwards.set(0, 0, 0.01);
      lForwards = this.forwards.length();
    }

    const middleRadius = (segment.radius0 + segment.radius1) * 0.5;
    const middleFraction = (segment.fraction0 + segment.fraction1) * 0.5;
    const timeDimension = this.time * this.currentSubray!.timeScale * Math.pow(2, segment.iteration);

    this.middlePos.lerpVectors(segment.pos0, segment.pos1, 0.5);
    this.middleLinPos.lerpVectors(segment.linPos0, segment.linPos1, 0.5);
    const p = this.middleLinPos;

    this.newPos.set(
      this.simplexX.noise4d(p.x, p.y, p.z, timeDimension),
      this.simplexY.noise4d(p.x, p.y, p.z, timeDimension),
      this.simplexZ.noise4d(p.x, p.y, p.z, timeDimension),
    );
    this.newPos.multiplyScalar(segment.positionVariationFactor * lForwards);
    this.newPos.add(this.middlePos);

    const newSegment1 = this.getNewSegment();
    newSegment1.pos0.copy(segment.pos0);
    newSegment1.pos1.copy(this.newPos);
    newSegment1.linPos0.copy(segment.linPos0);
    newSegment1.linPos1.copy(this.middleLinPos);
    newSegment1.up0.copy(segment.up0);
    newSegment1.up1.copy(segment.up1);
    newSegment1.radius0 = segment.radius0;
    newSegment1.radius1 = middleRadius;
    newSegment1.fraction0 = segment.fraction0;
    newSegment1.fraction1 = middleFraction;
    newSegment1.positionVariationFactor = segment.positionVariationFactor * this.currentSubray!.roughness;
    newSegment1.iteration = segment.iteration + 1;

    const newSegment2 = this.getNewSegment();
    newSegment2.pos0.copy(this.newPos);
    newSegment2.pos1.copy(segment.pos1);
    newSegment2.linPos0.copy(this.middleLinPos);
    newSegment2.linPos1.copy(segment.linPos1);
    this.cross1.crossVectors(segment.up0, this.forwards.normalize());
    newSegment2.up0.crossVectors(this.forwards, this.cross1).normalize();
    newSegment2.up1.copy(segment.up1);
    newSegment2.radius0 = middleRadius;
    newSegment2.radius1 = segment.radius1;
    newSegment2.fraction0 = middleFraction;
    newSegment2.fraction1 = segment.fraction1;
    newSegment2.positionVariationFactor = segment.positionVariationFactor * this.currentSubray!.roughness;
    newSegment2.iteration = segment.iteration + 1;

    this.fractalRayRecursive(newSegment1);
    this.fractalRayRecursive(newSegment2);
  }

  createPrism(segment: Segment) {
    this.forwardsFill.subVectors(segment.pos1, segment.pos0).normalize();
    if (this.isInitialSegment) {
      this.currentCreateTriangleVertices(segment.pos0, segment.up0, this.forwardsFill, segment.radius0, 0);
      this.isInitialSegment = false;
    }
    this.currentCreateTriangleVertices(segment.pos1, segment.up0, this.forwardsFill, segment.radius1, segment.fraction1);
    this.createPrismFaces();
  }

  createTriangleVerticesWithoutUVs(pos: Vector3, up: Vector3, forwards: Vector3, radius: number, _u?: number) {
    this.side.crossVectors(up, forwards).multiplyScalar(radius * LightningStrike.COS30DEG);
    this.down.copy(up).multiplyScalar(-radius * LightningStrike.SIN30DEG);
    const p = this.vPos;
    const v = this.vertices;

    p.copy(pos).sub(this.side).add(this.down);
    v[this.currentCoordinate++] = p.x; v[this.currentCoordinate++] = p.y; v[this.currentCoordinate++] = p.z;
    p.copy(pos).add(this.side).add(this.down);
    v[this.currentCoordinate++] = p.x; v[this.currentCoordinate++] = p.y; v[this.currentCoordinate++] = p.z;
    p.copy(up).multiplyScalar(radius).add(pos);
    v[this.currentCoordinate++] = p.x; v[this.currentCoordinate++] = p.y; v[this.currentCoordinate++] = p.z;
    this.currentVertex += 3;
  }

  createTriangleVerticesWithUVs(pos: Vector3, up: Vector3, forwards: Vector3, radius: number, u: number) {
    this.side.crossVectors(up, forwards).multiplyScalar(radius * LightningStrike.COS30DEG);
    this.down.copy(up).multiplyScalar(-radius * LightningStrike.SIN30DEG);
    const p = this.vPos;
    const v = this.vertices;
    const uv = this.uvs!;

    p.copy(pos).sub(this.side).add(this.down);
    v[this.currentCoordinate++] = p.x; v[this.currentCoordinate++] = p.y; v[this.currentCoordinate++] = p.z;
    uv[this.currentUVCoordinate++] = u; uv[this.currentUVCoordinate++] = 0;
    p.copy(pos).add(this.side).add(this.down);
    v[this.currentCoordinate++] = p.x; v[this.currentCoordinate++] = p.y; v[this.currentCoordinate++] = p.z;
    uv[this.currentUVCoordinate++] = u; uv[this.currentUVCoordinate++] = 0.5;
    p.copy(up).multiplyScalar(radius).add(pos);
    v[this.currentCoordinate++] = p.x; v[this.currentCoordinate++] = p.y; v[this.currentCoordinate++] = p.z;
    uv[this.currentUVCoordinate++] = u; uv[this.currentUVCoordinate++] = 1;
    this.currentVertex += 3;
  }

  createPrismFaces() {
    const indices = this.indices;
    const vertex = this.currentVertex - 6;
    indices[this.currentIndex++] = vertex + 1;
    indices[this.currentIndex++] = vertex + 2;
    indices[this.currentIndex++] = vertex + 5;
    indices[this.currentIndex++] = vertex + 1;
    indices[this.currentIndex++] = vertex + 5;
    indices[this.currentIndex++] = vertex + 4;
    indices[this.currentIndex++] = vertex + 0;
    indices[this.currentIndex++] = vertex + 1;
    indices[this.currentIndex++] = vertex + 4;
    indices[this.currentIndex++] = vertex + 0;
    indices[this.currentIndex++] = vertex + 4;
    indices[this.currentIndex++] = vertex + 3;
    indices[this.currentIndex++] = vertex + 2;
    indices[this.currentIndex++] = vertex + 0;
    indices[this.currentIndex++] = vertex + 3;
    indices[this.currentIndex++] = vertex + 2;
    indices[this.currentIndex++] = vertex + 3;
    indices[this.currentIndex++] = vertex + 5;
  }

  createDefaultSubrayCreationCallbacks() {
    const random1 = this.randomGenerator.random.bind(this.randomGenerator);

    this.onDecideSubrayCreation = (segment: Segment, lightningStrike: LightningStrike) => {
      const subray = lightningStrike.currentSubray!;
      const period = lightningStrike.rayParameters.subrayPeriod;
      const dutyCycle = lightningStrike.rayParameters.subrayDutyCycle;

      const phase0 = (lightningStrike.rayParameters.isEternal && subray.recursion === 0)
        ? -random1() * period
        : MathUtils.lerp(subray.birthTime, subray.endPropagationTime, segment.fraction0) - random1() * period;

      const phase = lightningStrike.time - phase0;
      const currentCycle = Math.floor(phase / period);
      const childSubraySeed = random1() * (currentCycle + 1);
      const isActive = phase % period <= dutyCycle * period;

      let probability = 0;
      if (isActive) probability = lightningStrike.subrayProbability;

      if (subray.recursion < lightningStrike.maxSubrayRecursion && lightningStrike.numSubrays < lightningStrike.maxSubrays && random1() < probability) {
        const childSubray = lightningStrike.addNewSubray();
        const parentSeed = lightningStrike.randomGenerator.getSeed();
        childSubray.seed = childSubraySeed;
        lightningStrike.randomGenerator.setSeed(childSubraySeed);

        childSubray.recursion = subray.recursion + 1;
        childSubray.maxIterations = Math.max(1, subray.maxIterations - 1);
        childSubray.linPos0.set(random1(), random1(), random1()).multiplyScalar(1000);
        childSubray.linPos1.set(random1(), random1(), random1()).multiplyScalar(1000);
        childSubray.up0.copy(subray.up0);
        childSubray.up1.copy(subray.up1);
        childSubray.radius0 = segment.radius0 * lightningStrike.rayParameters.radius0Factor;
        childSubray.radius1 = Math.min(lightningStrike.rayParameters.minRadius, segment.radius1 * lightningStrike.rayParameters.radius1Factor);
        childSubray.birthTime = phase0 + currentCycle * period;
        childSubray.deathTime = childSubray.birthTime + period * dutyCycle;

        if (!lightningStrike.rayParameters.isEternal && subray.recursion === 0) {
          childSubray.birthTime = Math.max(childSubray.birthTime, subray.birthTime);
          childSubray.deathTime = Math.min(childSubray.deathTime, subray.deathTime);
        }

        childSubray.timeScale = subray.timeScale * 2;
        childSubray.roughness = subray.roughness;
        childSubray.straightness = subray.straightness;
        childSubray.propagationTimeFactor = subray.propagationTimeFactor;
        childSubray.vanishingTimeFactor = subray.vanishingTimeFactor;

        lightningStrike.onSubrayCreation(segment, subray, childSubray, lightningStrike);
        lightningStrike.randomGenerator.setSeed(parentSeed);
      }
    };

    const vec1Pos = new Vector3();
    const vec2Forward = new Vector3();
    const vec3Side = new Vector3();
    const vec4Up = new Vector3();

    this.onSubrayCreation = (_segment: Segment, _parentSubray: Subray, childSubray: Subray, lightningStrike: LightningStrike) => {
      lightningStrike.subrayCylinderPosition(_segment, _parentSubray, childSubray, 0.5, 0.6, 0.2);
    };

    this.subrayConePosition = (_segment: Segment, parentSubray: Subray, childSubray: Subray, heightFactor: number, sideWidthFactor: number, minSideWidthFactor: number) => {
      childSubray.pos0.copy(_segment.pos0);
      vec1Pos.subVectors(parentSubray.pos1, parentSubray.pos0);
      vec2Forward.copy(vec1Pos).normalize();
      vec1Pos.multiplyScalar(_segment.fraction0 + (1 - _segment.fraction0) * (random1() * heightFactor));
      const length = vec1Pos.length();
      vec3Side.crossVectors(parentSubray.up0, vec2Forward);
      const angle = 2 * Math.PI * random1();
      vec3Side.multiplyScalar(Math.cos(angle));
      vec4Up.copy(parentSubray.up0).multiplyScalar(Math.sin(angle));
      childSubray.pos1.copy(vec3Side).add(vec4Up).multiplyScalar(length * sideWidthFactor * (minSideWidthFactor + random1() * (1 - minSideWidthFactor))).add(vec1Pos).add(parentSubray.pos0);
    };

    this.subrayCylinderPosition = (_segment: Segment, parentSubray: Subray, childSubray: Subray, heightFactor: number, sideWidthFactor: number, minSideWidthFactor: number) => {
      childSubray.pos0.copy(_segment.pos0);
      vec1Pos.subVectors(parentSubray.pos1, parentSubray.pos0);
      vec2Forward.copy(vec1Pos).normalize();
      vec1Pos.multiplyScalar(_segment.fraction0 + (1 - _segment.fraction0) * ((2 * random1() - 1) * heightFactor));
      const length = vec1Pos.length();
      vec3Side.crossVectors(parentSubray.up0, vec2Forward);
      const angle = 2 * Math.PI * random1();
      vec3Side.multiplyScalar(Math.cos(angle));
      vec4Up.copy(parentSubray.up0).multiplyScalar(Math.sin(angle));
      childSubray.pos1.copy(vec3Side).add(vec4Up).multiplyScalar(length * sideWidthFactor * (minSideWidthFactor + random1() * (1 - minSideWidthFactor))).add(vec1Pos).add(parentSubray.pos0);
    };
  }

  createSubray(): Subray {
    return {
      seed: 0, maxIterations: 0, recursion: 0,
      pos0: new Vector3(), pos1: new Vector3(),
      linPos0: new Vector3(), linPos1: new Vector3(),
      up0: new Vector3(), up1: new Vector3(),
      radius0: 0, radius1: 0, birthTime: 0, deathTime: 0,
      timeScale: 0, roughness: 0, straightness: 0,
      propagationTimeFactor: 0, vanishingTimeFactor: 0,
      endPropagationTime: 0, beginVanishingTime: 0,
    };
  }

  createSegment(): Segment {
    return {
      iteration: 0,
      pos0: new Vector3(), pos1: new Vector3(),
      linPos0: new Vector3(), linPos1: new Vector3(),
      up0: new Vector3(), up1: new Vector3(),
      radius0: 0, radius1: 0, fraction0: 0, fraction1: 0,
      positionVariationFactor: 0,
    };
  }

  getNewSegment(): Segment {
    return this.raySegments[this.currentSegmentIndex++];
  }
}

export { LightningStrike };
export type { RayParameters };
