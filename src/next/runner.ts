import * as THREE from 'three';
import type { NextAcceptanceRuntime } from './runtime';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { EncounterSpec, JunctionSpec } from '../run/types';
import { RuntimeRoute } from '../run/route';

const SURFACE_END = 0.275;
const GLYPH_SCALE = 0.0105;
const POINT_ORDER = [
  'head', 'neckR', 'handR', 'underarmR', 'flankR',
  'foot', 'flankL', 'underarmL', 'handL', 'neckL',
] as const;
const STRUCTURE_PAIRS: readonly [PointName, PointName][] = [
  ['head', 'foot'],
  ['handL', 'handR'],
  ['underarmL', 'underarmR'],
  ['neckL', 'flankL'],
  ['neckR', 'flankR'],
];

type PointName = typeof POINT_ORDER[number];
type RunnerPoseName =
  | 'travel_head_first'
  | 'travel_feet_first'
  | 'neutral_base'
  | 'neutral_fall'
  | 'landing_recovery'
  | 'landing_impact';

type Point = { x: number; y: number; z: number };
type GlyphPose = Record<PointName, Point>;

type GlyphDefinition = {
  format: 'arkour-runner-glyph';
  version: 2;
  curve: number;
  poses: Record<string, GlyphPose>;
};

type PoseDescriptor = {
  source: string;
  sourcePose: string;
  orientation: 'head-first' | 'feet-first';
};

type PoseBank = {
  format: 'arkour-runner-pose-bank';
  version: 1;
  sources: Record<string, string>;
  poses: Record<RunnerPoseName, PoseDescriptor>;
  transitions: Array<{
    from: RunnerPoseName[];
    to: RunnerPoseName;
    durationMs: number;
  }>;
};

type ResolvedPose = {
  points: GlyphPose;
  curve: number;
  orientation: 'head-first' | 'feet-first';
};

type TourLeg = {
  route: RuntimeRoute;
  start: number;
  end: number;
};

type RuntimeBridge = {
  scene: THREE.Scene;
  tour: TourLeg[];
  timeline: number;
  pendingEncounter?: EncounterSpec;
  pendingJunction?: JunctionSpec;
};

type RunnerSnapshotWindow = Window & {
  ArkourRunnerSnapshot?: {
    visible: boolean;
    pose: RunnerPoseName;
    routeId?: string;
    distance?: number;
    orientationDegrees: number;
    heldEncounter?: string;
  };
};

function assetRoot(): URL {
  const nested = /\/next\/?$/.test(window.location.pathname) || /\/next\/index\.html$/.test(window.location.pathname);
  return new URL(nested ? '../runner-glyph/' : './runner-glyph/', window.location.href);
}

async function loadPoseBank(): Promise<{ bank: PoseBank; poses: Record<RunnerPoseName, ResolvedPose> }> {
  const bankUrl = new URL('runner-pose-bank-v1.json', assetRoot());
  const bankResponse = await fetch(bankUrl);
  if (!bankResponse.ok) throw new Error(`Runner pose bank returned ${bankResponse.status}`);
  const bank = await bankResponse.json() as PoseBank;
  if (bank.format !== 'arkour-runner-pose-bank' || bank.version !== 1) {
    throw new Error('Runner pose bank is not arkour-runner-pose-bank v1');
  }

  const sourceEntries = await Promise.all(Object.entries(bank.sources).map(async ([id, sourcePath]) => {
    const response = await fetch(new URL(sourcePath, bankUrl));
    if (!response.ok) throw new Error(`${id} returned ${response.status}`);
    const definition = await response.json() as GlyphDefinition;
    if (definition.format !== 'arkour-runner-glyph' || definition.version !== 2) {
      throw new Error(`${id} is not an arkour-runner-glyph v2 definition`);
    }
    return [id, definition] as const;
  }));

  const sources = Object.fromEntries(sourceEntries) as Record<string, GlyphDefinition>;
  const poses = {} as Record<RunnerPoseName, ResolvedPose>;
  for (const poseName of Object.keys(bank.poses) as RunnerPoseName[]) {
    const descriptor = bank.poses[poseName];
    const source = sources[descriptor.source];
    const points = source?.poses[descriptor.sourcePose];
    if (!source || !points) throw new Error(`Could not resolve Runner pose ${poseName}`);
    poses[poseName] = {
      points,
      curve: Number(source.curve) || 0,
      orientation: descriptor.orientation,
    };
  }

  return { bank, poses };
}

function clonePose(pose: GlyphPose): GlyphPose {
  return Object.fromEntries(POINT_ORDER.map((name) => [name, { ...pose[name] }])) as GlyphPose;
}

function sampleTour(tour: TourLeg[], progress: number): { route: RuntimeRoute; distance: number } | null {
  if (tour.length === 0) return null;
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const leg = tour.find((candidate) => clamped <= candidate.end + 1e-6) ?? tour[tour.length - 1];
  const span = Math.max(1e-6, leg.end - leg.start);
  const local = THREE.MathUtils.clamp((clamped - leg.start) / span, 0, 1);
  return { route: leg.route, distance: leg.route.length * local };
}

function nextEncounter(route: RuntimeRoute, distance: number): { encounter: EncounterSpec; remaining: number } | null {
  const encounter = [...(route.spec.encounters ?? [])]
    .sort((a, b) => a.at - b.at)
    .find((candidate) => candidate.at * route.length >= distance - 0.75);
  if (!encounter) return null;
  return { encounter, remaining: encounter.at * route.length - distance };
}

class RunnerEntity {
  readonly group = new THREE.Group();

  private bank?: PoseBank;
  private poses?: Record<RunnerPoseName, ResolvedPose>;
  private currentPoints?: GlyphPose;
  private currentCurve = 0.5;
  private targetPose: RunnerPoseName = 'travel_feet_first';
  private targetCurve = 0.5;
  private transitionMs = 300;
  private flipAngle = 0;
  private holdEncounterId?: string;
  private holdStartedAt = 0;
  private previousTime = performance.now();

  private readonly meshGeometry = new THREE.BufferGeometry();
  private readonly outlineGeometry = new THREE.BufferGeometry();
  private readonly structureGeometry = new THREE.BufferGeometry();
  private readonly fillMaterial = new THREE.MeshBasicMaterial({
    color: 0x58f0d8,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private readonly outlineMaterial = new THREE.LineBasicMaterial({
    color: 0xeafffb,
    transparent: true,
    opacity: 0.96,
  });
  private readonly structureMaterial = new THREE.LineBasicMaterial({
    color: 0x58f0d8,
    transparent: true,
    opacity: 0.32,
  });

  constructor() {
    this.group.name = 'arkour-runner';
    this.group.visible = false;
    this.group.renderOrder = 8;

    const mesh = new THREE.Mesh(this.meshGeometry, this.fillMaterial);
    mesh.renderOrder = 8;
    const outline = new THREE.LineLoop(this.outlineGeometry, this.outlineMaterial);
    outline.renderOrder = 9;
    const structure = new THREE.LineSegments(this.structureGeometry, this.structureMaterial);
    structure.renderOrder = 9;
    this.group.add(mesh, outline, structure);
  }

  async load(): Promise<void> {
    const loaded = await loadPoseBank();
    this.bank = loaded.bank;
    this.poses = loaded.poses;
    this.currentPoints = clonePose(loaded.poses.travel_feet_first.points);
    this.currentCurve = loaded.poses.travel_feet_first.curve;
    this.targetCurve = this.currentCurve;
    this.initialiseMeshTopology();
    this.updateGeometry();
  }

  update(
    sample: { route: RuntimeRoute; distance: number } | null,
    pendingEncounter: EncounterSpec | undefined,
    pendingJunction: JunctionSpec | undefined,
    undergroundProgress: number,
    now: number,
  ): void {
    const dt = Math.min(0.05, Math.max(0, (now - this.previousTime) / 1000));
    this.previousTime = now;

    if (!sample || !this.poses || !this.bank || !this.currentPoints) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    const pose = this.choosePose(sample, pendingEncounter, pendingJunction, undergroundProgress, now);
    this.setTargetPose(pose);

    const target = this.poses[this.targetPose];
    const duration = Math.max(0.06, this.transitionMs / 1000);
    const blend = 1 - Math.exp(-6 * dt / duration);
    for (const name of POINT_ORDER) {
      const current = this.currentPoints[name];
      const next = target.points[name];
      current.x = THREE.MathUtils.lerp(current.x, next.x, blend);
      current.y = THREE.MathUtils.lerp(current.y, next.y, blend);
      current.z = THREE.MathUtils.lerp(current.z, next.z, blend);
    }
    this.currentCurve = THREE.MathUtils.lerp(this.currentCurve, this.targetCurve, blend);

    const orientationTarget = target.orientation === 'head-first' ? Math.PI : 0;
    const flipBlend = 1 - Math.exp(-6 * dt / 0.42);
    this.flipAngle = THREE.MathUtils.lerp(this.flipAngle, orientationTarget, flipBlend);

    this.updateGeometry();
    this.updateTransform(sample);

    (window as RunnerSnapshotWindow).ArkourRunnerSnapshot = {
      visible: true,
      pose: this.targetPose,
      routeId: sample.route.id,
      distance: sample.distance,
      orientationDegrees: THREE.MathUtils.radToDeg(this.flipAngle),
      heldEncounter: pendingEncounter?.id,
    };
  }

  private choosePose(
    sample: { route: RuntimeRoute; distance: number },
    pendingEncounter: EncounterSpec | undefined,
    pendingJunction: JunctionSpec | undefined,
    undergroundProgress: number,
    now: number,
  ): RunnerPoseName {
    if (pendingEncounter) {
      if (this.holdEncounterId !== pendingEncounter.id) {
        this.holdEncounterId = pendingEncounter.id;
        this.holdStartedAt = now;
      }
      const heldFor = now - this.holdStartedAt;
      const dramatic = pendingEncounter.type === 'ice' || pendingEncounter.type === 'demon';
      if (dramatic && heldFor < 100) return 'landing_impact';
      if (heldFor < 360) return 'landing_recovery';
      return 'neutral_base';
    }

    this.holdEncounterId = undefined;
    if (pendingJunction) return 'neutral_base';
    if (undergroundProgress < 0.045) return 'neutral_fall';

    const upcoming = nextEncounter(sample.route, sample.distance);
    if (upcoming) {
      const aggressive = upcoming.encounter.type === 'ice' || upcoming.encounter.type === 'demon';
      const diveRange = Math.max(12, upcoming.encounter.approachDistance * 1.45);
      if (aggressive && upcoming.remaining < diveRange && upcoming.remaining > upcoming.encounter.engageDistance) {
        return 'travel_head_first';
      }
    }

    return 'travel_feet_first';
  }

  private setTargetPose(next: RunnerPoseName): void {
    if (!this.bank || !this.poses || next === this.targetPose) return;
    const transition = this.bank.transitions.find((candidate) => (
      candidate.to === next && candidate.from.includes(this.targetPose)
    ));
    this.targetPose = next;
    this.targetCurve = this.poses[next].curve;
    this.transitionMs = transition?.durationMs ?? (next === 'landing_impact' ? 80 : 260);
  }

  private initialiseMeshTopology(): void {
    if (!this.currentPoints) return;
    const contour = POINT_ORDER.map((name) => {
      const point = this.currentPoints?.[name];
      return new THREE.Vector2(point?.x ?? 0, point?.y ?? 0);
    });
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    this.meshGeometry.setIndex(triangles.flat());
  }

  private updateGeometry(): void {
    if (!this.currentPoints) return;

    const meshPositions = new Float32Array(POINT_ORDER.length * 3);
    POINT_ORDER.forEach((name, index) => {
      const point = this.currentPoints?.[name];
      if (!point) return;
      meshPositions[index * 3] = point.x * GLYPH_SCALE;
      meshPositions[index * 3 + 1] = point.y * GLYPH_SCALE;
      meshPositions[index * 3 + 2] = point.z * GLYPH_SCALE;
    });
    this.meshGeometry.setAttribute('position', new THREE.BufferAttribute(meshPositions, 3));
    this.meshGeometry.computeVertexNormals();

    const controlPoints = POINT_ORDER.map((name) => {
      const point = this.currentPoints?.[name] ?? { x: 0, y: 0, z: 0 };
      return new THREE.Vector3(point.x, point.y, point.z).multiplyScalar(GLYPH_SCALE);
    });
    const outlineCurve = new THREE.CatmullRomCurve3(
      controlPoints,
      true,
      'catmullrom',
      THREE.MathUtils.lerp(0.08, 0.46, THREE.MathUtils.clamp(this.currentCurve, 0, 1)),
    );
    const outlinePoints = outlineCurve.getPoints(79);
    this.outlineGeometry.setFromPoints(outlinePoints);

    const structurePositions: number[] = [];
    for (const [aName, bName] of STRUCTURE_PAIRS) {
      const a = this.currentPoints[aName];
      const b = this.currentPoints[bName];
      structurePositions.push(
        a.x * GLYPH_SCALE, a.y * GLYPH_SCALE, a.z * GLYPH_SCALE,
        b.x * GLYPH_SCALE, b.y * GLYPH_SCALE, b.z * GLYPH_SCALE,
      );
    }
    this.structureGeometry.setAttribute('position', new THREE.Float32BufferAttribute(structurePositions, 3));
  }

  private updateTransform(sample: { route: RuntimeRoute; distance: number }): void {
    const frame = createRouteFrame();
    sampleRouteFrameAtDistance(sample.route, sample.distance, frame);
    this.group.position.copy(frame.position).addScaledVector(frame.up, 0.12);

    const basis = new THREE.Matrix4().makeBasis(frame.right, frame.forward, frame.up);
    this.group.quaternion.setFromRotationMatrix(basis);
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.flipAngle);
    this.group.quaternion.multiply(flip);
  }
}

export function attachRunnerEntity(runtime: NextAcceptanceRuntime): void {
  const bridge = runtime as unknown as RuntimeBridge;
  const runner = new RunnerEntity();
  bridge.scene.add(runner.group);

  runner.load().catch((error: unknown) => {
    console.warn('Could not load the production Runner pose bank', error);
  });

  const frame = (now: number): void => {
    const undergroundProgress = bridge.timeline >= SURFACE_END
      ? THREE.MathUtils.clamp((bridge.timeline - SURFACE_END) / (1 - SURFACE_END), 0, 1)
      : -1;
    const sample = undergroundProgress >= 0 ? sampleTour(bridge.tour, undergroundProgress) : null;
    runner.update(sample, bridge.pendingEncounter, bridge.pendingJunction, undergroundProgress, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
