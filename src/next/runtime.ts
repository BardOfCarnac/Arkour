import * as THREE from 'three';
import type { ArchitectureDocument } from '../architecture/document/types';
import { generateRouteFirstArchitecture } from '../architecture/route-first';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import { RuntimeRoute } from '../run/route';
import { addScenePlan } from '../run/scenery';
import type { EncounterSpec, JunctionSpec, RunWorld, Vec3 } from '../run/types';
import { createNextPresentationKeepout } from './presentation-keepout';

interface AcceptanceElements {
  canvasHost: HTMLElement;
  stage: HTMLElement;
  detail: HTMLElement;
  progress: HTMLElement;
  playButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  scrub: HTMLInputElement;
  encounterGate: HTMLElement;
  encounterTitle: HTMLElement;
  encounterMeta: HTMLElement;
  encounterContinue: HTMLButtonElement;
  routeChoice: HTMLElement;
  routeChoiceTitle: HTMLElement;
  routeChoiceButtons: HTMLElement;
}

interface TourLeg {
  route: RuntimeRoute;
  start: number;
  end: number;
}

interface TourSample {
  route: RuntimeRoute;
  distance: number;
  globalDistance: number;
}

interface ArcCameraTour {
  camera: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
}

const SURFACE_END = 0.275;
const AUTO_DURATION = 48;
const SURFACE_Y = 8;
const MIRROR_FLOOR_RISE = 3.2;
const MIRROR_HORIZONTAL_STEP = MIRROR_FLOOR_RISE * Math.sqrt(3);
const MIRROR_AZIMUTH = Math.PI / 8;
const JUNCTION_PAUSE_DISTANCE = 7;

const cyan = 0x58f0d8;
const cyanDim = 0x235a58;
const routeRed = 0xff4054;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function vector([x, y, z]: Vec3): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function addOutlinedBox(
  scene: THREE.Scene,
  size: THREE.Vector3,
  position: THREE.Vector3,
  fill: THREE.Material,
  edge: THREE.Material,
): void {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, fill);
  mesh.position.copy(position);
  scene.add(mesh);

  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge);
  lines.position.copy(position);
  scene.add(lines);
}

function addSurface(scene: THREE.Scene): void {
  const fill = new THREE.MeshStandardMaterial({ color: 0x080d0f, roughness: 0.92, metalness: 0.16 });
  const edge = new THREE.LineBasicMaterial({ color: cyanDim, transparent: true, opacity: 0.62 });

  addOutlinedBox(scene, new THREE.Vector3(40, 0.7, 120), new THREE.Vector3(-25, SURFACE_Y, 18), fill, edge);
  addOutlinedBox(scene, new THREE.Vector3(40, 0.7, 120), new THREE.Vector3(25, SURFACE_Y, 18), fill, edge);
  addOutlinedBox(scene, new THREE.Vector3(10, 0.7, 42), new THREE.Vector3(0, SURFACE_Y, -31), fill, edge);
  addOutlinedBox(scene, new THREE.Vector3(10, 0.7, 78), new THREE.Vector3(0, SURFACE_Y, 47), fill, edge);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, 0.22, 8, 48),
    new THREE.MeshBasicMaterial({ color: routeRed }),
  );
  ring.position.set(0, SURFACE_Y + 0.16, 0);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.4, 0.08, 6, 48),
    new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.75 }),
  );
  innerRing.position.copy(ring.position);
  innerRing.rotation.copy(ring.rotation);
  scene.add(innerRing);
}

function mirrorNodePosition(document: ArchitectureDocument, nodeId: string): THREE.Vector3 {
  const node = document.nodes.find((candidate) => candidate.id === nodeId);
  const floor = node?.layout?.floor ?? 1;
  const column = node?.layout?.column ?? 0;
  const horizontal = Math.abs(column) * MIRROR_HORIZONTAL_STEP;
  return new THREE.Vector3(
    20 + column * MIRROR_HORIZONTAL_STEP * Math.cos(MIRROR_AZIMUTH),
    SURFACE_Y + 1.5 + floor * MIRROR_FLOOR_RISE,
    -4 + horizontal * Math.sin(MIRROR_AZIMUTH),
  );
}

function addSurfaceMirror(scene: THREE.Scene, document: ArchitectureDocument): void {
  const fill = new THREE.MeshBasicMaterial({ color: 0x071012, transparent: true, opacity: 0.78 });
  const edge = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.72 });

  for (const node of document.nodes) {
    const position = mirrorNodePosition(document, node.id);
    const geometry = new THREE.BoxGeometry(node.kind === 'blackIce' ? 4.4 : 3.5, 2.15, 3.5);
    const mesh = new THREE.Mesh(geometry, fill);
    mesh.position.copy(position);
    scene.add(mesh);

    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge);
    lines.position.copy(position);
    scene.add(lines);
  }

  for (const connection of document.edges) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      mirrorNodePosition(document, connection.from),
      mirrorNodePosition(document, connection.to),
    ]);
    scene.add(new THREE.Line(geometry, edge));
  }
}

function addWireAccents(scene: THREE.Scene): void {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.InstancedMesh) return;
    meshes.push(object);
  });

  const material = new THREE.LineBasicMaterial({ color: cyanDim, transparent: true, opacity: 0.38 });
  for (const mesh of meshes) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), material);
    mesh.add(edges);
  }
}

function addStraightRail(
  scene: THREE.Scene,
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  name: string,
): void {
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 1e-4) return;

  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 7, 1, false);
  const rail = new THREE.Mesh(geometry, material);
  rail.name = name;
  rail.position.copy(from).add(to).multiplyScalar(0.5);
  rail.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  rail.scale.y = length;
  scene.add(rail);
}

function addRouteRails(scene: THREE.Scene, routes: Map<string, RuntimeRoute>): void {
  for (const route of routes.values()) {
    const material = new THREE.MeshBasicMaterial({
      color: routeRed,
      transparent: true,
      opacity: route.id === 'trunk' ? 0.96 : 0.72,
    });

    route.spec.segments.forEach((segment, index) => {
      if (segment.kind === 'line') {
        addStraightRail(
          scene,
          vector(segment.from),
          vector(segment.to),
          material,
          `next-route:${route.id}:${index}`,
        );
        return;
      }

      const curve = new THREE.QuadraticBezierCurve3(
        vector(segment.from),
        vector(segment.control),
        vector(segment.to),
      );
      const geometry = new THREE.TubeGeometry(curve, 32, 0.2, 7, false);
      const rail = new THREE.Mesh(geometry, material);
      rail.name = `next-route:${route.id}:${index}`;
      scene.add(rail);
    });
  }
}

function buildTour(
  world: RunWorld,
  routes: Map<string, RuntimeRoute>,
  selectedExits: ReadonlyMap<string, string>,
): TourLeg[] {
  const selected: RuntimeRoute[] = [];
  const visited = new Set<string>();
  let routeId: string | undefined = world.startRoute;

  while (routeId && !visited.has(routeId)) {
    visited.add(routeId);
    const route = routes.get(routeId);
    if (!route) break;
    selected.push(route);

    const junction = world.junctions.find((candidate) => candidate.incomingRoute === routeId);
    if (!junction) break;
    routeId = selectedExits.get(junction.id) ?? junction.defaultExit;
  }

  const total = selected.reduce((sum, route) => sum + route.length, 0);
  let cursor = 0;
  return selected.map((route) => {
    const start = cursor;
    cursor += route.length;
    return { route, start: total > 0 ? start / total : 0, end: total > 0 ? cursor / total : 1 };
  });
}

function sampleTour(legs: TourLeg[], progress: number): TourSample {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const leg = legs.find((candidate) => clamped <= candidate.end + 1e-6) ?? legs[legs.length - 1];
  if (!leg) throw new Error('Acceptance tour has no routes');
  const span = Math.max(1e-6, leg.end - leg.start);
  const local = THREE.MathUtils.clamp((clamped - leg.start) / span, 0, 1);
  const globalDistance = legs.reduce((sum, candidate) => {
    if (candidate === leg) return sum + candidate.route.length * local;
    if (candidate.end <= leg.start) return sum + candidate.route.length;
    return sum;
  }, 0);
  return { route: leg.route, distance: leg.route.length * local, globalDistance };
}

function nearestEncounterDistance(route: RuntimeRoute, distance: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const encounter of route.spec.encounters ?? []) {
    nearest = Math.min(nearest, Math.abs(encounter.at * route.length - distance));
  }
  return nearest;
}

/**
 * The rail stays hard and angular. The camera is a separate deterministic
 * spline which arcs around that rail but always returns to the known-safe
 * approach line at major components.
 */
function buildArcCameraTour(legs: TourLeg[]): ArcCameraTour {
  const totalLength = legs.reduce((sum, leg) => sum + leg.route.length, 0);
  const count = Math.max(36, Math.ceil(totalLength / 7));
  const cameraPoints: THREE.Vector3[] = [];
  const lookPoints: THREE.Vector3[] = [];
  const frame = createRouteFrame();
  const lookFrame = createRouteFrame();

  for (let index = 0; index <= count; index += 1) {
    const u = index / count;
    const sample = sampleTour(legs, u);
    sampleRouteFrameAtDistance(sample.route, sample.distance, frame);

    const nearest = nearestEncounterDistance(sample.route, sample.distance);
    const betweenNodes = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(nearest / 20, 0, 1),
      0,
      1,
    );
    const wing = Math.sin(sample.globalDistance / 25) * (0.55 + betweenNodes * 1.55);
    const lift = 0.65 + betweenNodes * 0.55;

    cameraPoints.push(
      frame.position.clone()
        .addScaledVector(frame.forward, -1.8)
        .addScaledVector(frame.right, wing)
        .addScaledVector(frame.up, lift),
    );

    const lookSample = sampleTour(legs, Math.min(1, u + 0.025));
    sampleRouteFrameAtDistance(lookSample.route, lookSample.distance, lookFrame);
    lookPoints.push(lookFrame.position.clone().addScaledVector(lookFrame.up, 0.15));
  }

  return {
    camera: new THREE.CatmullRomCurve3(cameraPoints, false, 'catmullrom', 0.12),
    look: new THREE.CatmullRomCurve3(lookPoints, false, 'catmullrom', 0.1),
  };
}

function nextEncounter(route: RuntimeRoute, distance: number): EncounterSpec | undefined {
  return [...(route.spec.encounters ?? [])]
    .sort((a, b) => a.at - b.at)
    .find((encounter) => encounter.at * route.length >= distance - 2.5);
}

function stageFor(
  timeline: number,
  sample: TourSample | null,
  pendingEncounter?: EncounterSpec,
  pendingJunction?: JunctionSpec,
): { title: string; detail: string } {
  if (pendingEncounter) {
    return {
      title: pendingEncounter.label.toUpperCase(),
      detail: `${pendingEncounter.meta || pendingEncounter.type.toUpperCase()} // HOLD FOR RESOLUTION`,
    };
  }
  if (pendingJunction) {
    return {
      title: 'CHOOSE ROUTE',
      detail: pendingJunction.exits.map((exit) => exit.label.toUpperCase()).join(' // '),
    };
  }
  if (timeline < 0.16) return { title: 'SURFACE APPROACH', detail: 'CAMERAS, MAIN // SCHEMATIC GRAPH MIRROR' };
  if (timeline < SURFACE_END) return { title: 'JACK-IN DESCENT', detail: 'HARD ROUTE // CURVED CAMERA APPROACH' };
  if (!sample) return { title: 'DESCENT', detail: 'ROUTE-FIRST CITY' };

  const encounter = nextEncounter(sample.route, sample.distance);
  if (encounter) {
    const remaining = encounter.at * sample.route.length - sample.distance;
    const range = remaining > 1 ? `${Math.round(remaining)} M` : 'PASSING';
    return { title: encounter.label.toUpperCase(), detail: `${encounter.meta || encounter.type.toUpperCase()} // ${range}` };
  }
  return { title: 'VERTICAL TRANSIT', detail: sample.route.label.toUpperCase() };
}

export class NextAcceptanceRuntime {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.16, 950);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly routes = new Map<string, RuntimeRoute>();
  private readonly clock = new THREE.Clock();
  private readonly selectedExits = new Map<string, string>();
  private readonly clearedEncounters = new Set<string>();
  private tour: TourLeg[] = [];
  private undergroundCamera!: THREE.CatmullRomCurve3;
  private undergroundLook!: THREE.CatmullRomCurve3;
  private pendingJunction?: JunctionSpec;
  private pendingEncounter?: EncounterSpec;
  private elapsed = 0;
  private readonly surfaceCamera = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-52, 15.5, -34),
    new THREE.Vector3(-39, 14.2, -25),
    new THREE.Vector3(-27, 13.1, -17),
    new THREE.Vector3(-16, 12.2, -10),
    new THREE.Vector3(-8, 11.2, -5),
    new THREE.Vector3(-3, 10.5, -2),
    new THREE.Vector3(0, 10.1, -3.6),
  ], false, 'catmullrom', 0.32);
  private readonly surfaceLook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(12, 11, -1),
    new THREE.Vector3(10, 10.5, 1),
    new THREE.Vector3(7, 9.7, 2),
    new THREE.Vector3(3, 8.8, 2),
    new THREE.Vector3(0, 4.2, 0),
  ], false, 'catmullrom', 0.32);

  private timeline = 0;
  private playing = true;

  constructor(
    private readonly world: RunWorld,
    document: ArchitectureDocument,
    private readonly elements: AcceptanceElements,
  ) {
    for (const spec of world.routes) this.routes.set(spec.id, new RuntimeRoute(spec));
    this.rebuildTour();

    this.scene.background = new THREE.Color(0x020406);
    this.scene.fog = new THREE.FogExp2(0x020607, 0.0068);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.2 : 1.55));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.elements.canvasHost.appendChild(this.renderer.domElement);

    const architecture = generateRouteFirstArchitecture(world, { seed: 4712, density: 0.82 });
    const presentationKeepout = createNextPresentationKeepout(world, this.routes);
    addScenePlan(this.scene, this.routes, architecture, presentationKeepout);
    addWireAccents(this.scene);
    addRouteRails(this.scene, this.routes);
    addSurface(this.scene);
    addSurfaceMirror(this.scene, document);

    const glow = new THREE.PointLight(0xff4054, 4.4, 40, 1.8);
    glow.position.set(0, SURFACE_Y + 1.5, 0);
    this.scene.add(glow);

    this.hideEncounterGate();
    this.hideRouteChoice();
    this.elements.encounterContinue.addEventListener('click', this.continueEncounter);
    this.elements.playButton.addEventListener('click', this.togglePlay);
    this.elements.resetButton.addEventListener('click', this.reset);
    this.elements.scrub.addEventListener('input', this.scrub);
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keydown);
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keydown);
  }

  private rebuildTour(): void {
    this.tour = buildTour(this.world, this.routes, this.selectedExits);
    const arcTour = buildArcCameraTour(this.tour);
    this.undergroundCamera = arcTour.camera;
    this.undergroundLook = arcTour.look;
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    if (this.playing) {
      this.timeline = Math.min(1, this.timeline + dt / AUTO_DURATION);
      if (this.timeline >= 1) {
        this.playing = false;
        this.elements.playButton.textContent = 'Replay';
      }
    }

    let sample = this.timeline >= SURFACE_END
      ? sampleTour(this.tour, (this.timeline - SURFACE_END) / (1 - SURFACE_END))
      : null;

    if (sample && this.pauseForEncounter(sample)) {
      sample = sampleTour(this.tour, (this.timeline - SURFACE_END) / (1 - SURFACE_END));
    }

    if (sample && !this.pendingEncounter && this.pauseForRouteChoice(sample)) {
      sample = sampleTour(this.tour, (this.timeline - SURFACE_END) / (1 - SURFACE_END));
    }

    this.updateCamera(sample);
    this.updateHud(sample);
    this.renderer.render(this.scene, this.camera);
  };

  private pauseForEncounter(sample: TourSample): boolean {
    if (this.pendingEncounter || this.pendingJunction) return false;

    const encounter = [...(sample.route.spec.encounters ?? [])]
      .filter((candidate) => !this.clearedEncounters.has(candidate.id))
      .sort((a, b) => a.at - b.at)
      .find((candidate) => {
        const encounterDistance = candidate.at * sample.route.length;
        const remaining = encounterDistance - sample.distance;
        return remaining <= candidate.engageDistance && remaining >= -0.75;
      });
    if (!encounter) return false;

    const encounterDistance = encounter.at * sample.route.length;
    const stopOffset = Math.min(1.4, Math.max(0.7, encounter.engageDistance * 0.18));
    const stopDistance = Math.max(0, encounterDistance - stopOffset);
    this.timeline = this.timelineForRouteDistance(sample.route.id, stopDistance);
    this.playing = false;
    this.pendingEncounter = encounter;
    this.elements.playButton.textContent = 'Resolve node';
    this.showEncounterGate(encounter);
    return true;
  }

  private timelineForRouteDistance(routeId: string, distance: number): number {
    const leg = this.tour.find((candidate) => candidate.route.id === routeId);
    if (!leg) return this.timeline;
    const local = THREE.MathUtils.clamp(distance / Math.max(leg.route.length, 1e-6), 0, 1);
    const undergroundProgress = leg.start + (leg.end - leg.start) * local;
    return SURFACE_END + undergroundProgress * (1 - SURFACE_END);
  }

  private showEncounterGate(encounter: EncounterSpec): void {
    this.elements.encounterTitle.textContent = encounter.label.toUpperCase();
    this.elements.encounterMeta.textContent = `${encounter.meta || encounter.type.toUpperCase()} // RESOLVE AT TABLE`;
    this.elements.encounterGate.hidden = false;
  }

  private hideEncounterGate(): void {
    this.elements.encounterGate.hidden = true;
  }

  private continueEncounter = (): void => {
    if (!this.pendingEncounter) return;
    this.clearedEncounters.add(this.pendingEncounter.id);
    this.pendingEncounter = undefined;
    this.hideEncounterGate();
    this.playing = true;
    this.elements.playButton.textContent = 'Pause';
  };

  private pauseForRouteChoice(sample: TourSample): boolean {
    if (this.pendingJunction || this.pendingEncounter) return false;
    const junction = this.world.junctions.find((candidate) => (
      candidate.incomingRoute === sample.route.id && !this.selectedExits.has(candidate.id)
    ));
    if (!junction) return false;

    const junctionDistance = junction.at * sample.route.length;
    const remaining = junctionDistance - sample.distance;
    const triggerDistance = Math.min(JUNCTION_PAUSE_DISTANCE, junction.approachDistance);
    if (remaining > triggerDistance) return false;

    this.timeline = this.timelineForJunction(junction);
    this.playing = false;
    this.pendingJunction = junction;
    this.elements.playButton.textContent = 'Choose route';
    this.showRouteChoice(junction);
    return true;
  }

  private timelineForJunction(junction: JunctionSpec): number {
    const leg = this.tour.find((candidate) => candidate.route.id === junction.incomingRoute);
    if (!leg) return this.timeline;
    const undergroundProgress = leg.start + (leg.end - leg.start) * junction.at;
    return SURFACE_END + undergroundProgress * (1 - SURFACE_END);
  }

  private showRouteChoice(junction: JunctionSpec): void {
    const incoming = this.routes.get(junction.incomingRoute);
    const encounter = incoming?.spec.encounters
      ?.slice()
      .sort((a, b) => Math.abs(a.at - junction.at) - Math.abs(b.at - junction.at))[0];

    this.elements.routeChoiceTitle.textContent = `${encounter?.label ?? 'JUNCTION'} // CHOOSE ROUTE`;
    this.elements.routeChoiceButtons.replaceChildren();

    junction.exits.forEach((exit, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'route-choice-button';
      button.setAttribute('aria-label', `Choose ${exit.label} route`);

      const direction = document.createElement('strong');
      direction.textContent = exit.label.toUpperCase();
      const route = this.routes.get(exit.routeId);
      const destination = document.createElement('small');
      destination.textContent = route?.label ?? `ROUTE ${index + 1}`;

      button.append(direction, destination);
      button.addEventListener('click', () => this.chooseExit(junction, exit.routeId));
      this.elements.routeChoiceButtons.appendChild(button);
    });

    this.elements.routeChoice.hidden = false;
  }

  private hideRouteChoice(): void {
    this.elements.routeChoice.hidden = true;
    this.elements.routeChoiceButtons.replaceChildren();
  }

  private chooseExit(junction: JunctionSpec, routeId: string): void {
    if (!junction.exits.some((exit) => exit.routeId === routeId)) return;

    this.selectedExits.set(junction.id, routeId);
    this.pendingJunction = undefined;
    this.hideRouteChoice();
    this.rebuildTour();

    this.timeline = Math.min(1, this.timelineForJunction(junction) + 0.001);
    this.playing = true;
    this.elements.playButton.textContent = 'Pause';
  }

  private updateCamera(sample: TourSample | null): void {
    if (!sample) {
      const u = THREE.MathUtils.smoothstep(this.timeline / SURFACE_END, 0, 1);
      this.surfaceCamera.getPointAt(u, this.camera.position);
      const target = this.surfaceLook.getPointAt(THREE.MathUtils.clamp(u * 1.08, 0, 1));
      this.camera.lookAt(target);
      return;
    }

    const u = THREE.MathUtils.clamp((this.timeline - SURFACE_END) / (1 - SURFACE_END), 0, 1);
    this.undergroundCamera.getPointAt(u, this.camera.position);
    const target = this.undergroundLook.getPointAt(Math.min(1, u + 0.018));

    if (this.pendingEncounter) {
      const forward = target.clone().sub(this.camera.position).normalize();
      const referenceUp = Math.abs(forward.y) > 0.94
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(referenceUp, forward).normalize();
      const up = new THREE.Vector3().crossVectors(forward, right).normalize();
      this.camera.position
        .addScaledVector(right, Math.sin(this.elapsed * 0.8) * 0.34)
        .addScaledVector(up, Math.cos(this.elapsed * 0.55) * 0.12);
    }

    this.camera.lookAt(target);
  }

  private updateHud(sample: TourSample | null): void {
    const stage = stageFor(this.timeline, sample, this.pendingEncounter, this.pendingJunction);
    this.elements.stage.textContent = stage.title;
    this.elements.detail.textContent = stage.detail;
    this.elements.progress.style.width = `${this.timeline * 100}%`;
    this.elements.scrub.value = String(this.timeline);
  }

  private togglePlay = (): void => {
    if (this.pendingEncounter || this.pendingJunction) return;
    if (this.timeline >= 1) {
      this.timeline = 0;
      this.playing = true;
      this.elements.playButton.textContent = 'Pause';
      return;
    }
    this.playing = !this.playing;
    this.elements.playButton.textContent = this.playing ? 'Pause' : 'Run';
  };

  private reset = (): void => {
    this.selectedExits.clear();
    this.clearedEncounters.clear();
    this.pendingEncounter = undefined;
    this.pendingJunction = undefined;
    this.hideEncounterGate();
    this.hideRouteChoice();
    this.rebuildTour();
    this.timeline = 0;
    this.playing = true;
    this.elements.playButton.textContent = 'Pause';
  };

  private scrub = (): void => {
    this.pendingEncounter = undefined;
    this.pendingJunction = undefined;
    this.hideEncounterGate();
    this.hideRouteChoice();
    this.timeline = Number(this.elements.scrub.value);
    this.playing = false;
    this.elements.playButton.textContent = 'Run';
  };

  private keydown = (event: KeyboardEvent): void => {
    if (this.pendingEncounter && event.key === 'Enter') {
      this.continueEncounter();
      return;
    }
    if (this.pendingJunction && /^[1-9]$/.test(event.key)) {
      const exit = this.pendingJunction.exits[Number(event.key) - 1];
      if (exit) this.chooseExit(this.pendingJunction, exit.routeId);
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      this.togglePlay();
    }
    if (event.key.toLowerCase() === 'r') this.reset();
  };

  private resize = (): void => {
    const width = this.elements.canvasHost.clientWidth;
    const height = this.elements.canvasHost.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}
