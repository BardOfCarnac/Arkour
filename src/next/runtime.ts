import * as THREE from 'three';
import type { ArchitectureDocument } from '../architecture/document/types';
import { generateRouteFirstArchitecture } from '../architecture/route-first';
import { RUN_CAMERA_PROFILE } from '../run/camera-profile';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import { RuntimeRoute } from '../run/route';
import { addScenePlan } from '../run/scenery';
import type { EncounterSpec, RunWorld } from '../run/types';

interface AcceptanceElements {
  canvasHost: HTMLElement;
  stage: HTMLElement;
  detail: HTMLElement;
  progress: HTMLElement;
  playButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  scrub: HTMLInputElement;
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

const SURFACE_END = 0.275;
const AUTO_DURATION = 42;
const SURFACE_Y = 8;

const cyan = 0x58f0d8;
const cyanDim = 0x235a58;
const routeRed = 0xff4054;

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

  addOutlinedBox(scene, new THREE.Vector3(40, 0.7, 120), new THREE.Vector3(-25, SURFACE_Y, 22), fill, edge);
  addOutlinedBox(scene, new THREE.Vector3(40, 0.7, 120), new THREE.Vector3(25, SURFACE_Y, 22), fill, edge);
  addOutlinedBox(scene, new THREE.Vector3(10, 0.7, 42), new THREE.Vector3(0, SURFACE_Y, -27), fill, edge);
  addOutlinedBox(scene, new THREE.Vector3(10, 0.7, 86), new THREE.Vector3(0, SURFACE_Y, 57), fill, edge);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, 0.22, 8, 48),
    new THREE.MeshBasicMaterial({ color: routeRed }),
  );
  ring.position.set(0, SURFACE_Y + 0.16, 3.8);
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
  return new THREE.Vector3(20 + column * 4.6, SURFACE_Y + 1.7 + floor * 2.7, -3 + floor * 1.25);
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

function addRouteRails(scene: THREE.Scene, routes: Map<string, RuntimeRoute>): void {
  for (const route of routes.values()) {
    const geometry = new THREE.TubeGeometry(
      route.curve,
      Math.max(72, Math.round(route.length * 1.6)),
      0.2,
      7,
      false,
    );
    const material = new THREE.MeshBasicMaterial({
      color: routeRed,
      transparent: true,
      opacity: route.id === 'trunk' ? 0.96 : 0.66,
    });
    const rail = new THREE.Mesh(geometry, material);
    rail.name = `next-route:${route.id}`;
    scene.add(rail);
  }
}

function buildDefaultTour(world: RunWorld, routes: Map<string, RuntimeRoute>): TourLeg[] {
  const selected: RuntimeRoute[] = [];
  const visited = new Set<string>();
  let routeId: string | undefined = world.startRoute;

  while (routeId && !visited.has(routeId)) {
    visited.add(routeId);
    const route = routes.get(routeId);
    if (!route) break;
    selected.push(route);
    const junction = world.junctions.find((candidate) => candidate.incomingRoute === routeId);
    routeId = junction?.defaultExit;
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

function nextEncounter(route: RuntimeRoute, distance: number): EncounterSpec | undefined {
  return [...(route.spec.encounters ?? [])]
    .sort((a, b) => a.at - b.at)
    .find((encounter) => encounter.at * route.length >= distance - 2.5);
}

function stageFor(timeline: number, sample: TourSample | null): { title: string; detail: string } {
  if (timeline < 0.16) return { title: 'SURFACE APPROACH', detail: 'EDITOR GRAPH MIRROR // ACCESS POINT AHEAD' };
  if (timeline < SURFACE_END) return { title: 'JACK-IN DESCENT', detail: 'SURFACE → RESERVED TRAVERSAL VOLUME' };
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
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.16, 760);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly routes = new Map<string, RuntimeRoute>();
  private readonly tour: TourLeg[];
  private readonly frame = createRouteFrame();
  private readonly lookFrame = createRouteFrame();
  private readonly clock = new THREE.Clock();
  private readonly surfaceCamera = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-52, 15.5, -34),
    new THREE.Vector3(-39, 14.2, -25),
    new THREE.Vector3(-27, 13.1, -17),
    new THREE.Vector3(-16, 12.2, -10),
    new THREE.Vector3(-8, 11.2, -5),
    new THREE.Vector3(-3, 10.5, -2),
    new THREE.Vector3(0, 10.1, -4.2),
  ], false, 'catmullrom', 0.32);
  private readonly surfaceLook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(12, 11, -1),
    new THREE.Vector3(10, 10.5, 1),
    new THREE.Vector3(7, 9.7, 2),
    new THREE.Vector3(3, 8.8, 4),
    new THREE.Vector3(0, 6.8, 9),
  ], false, 'catmullrom', 0.32);

  private timeline = 0;
  private playing = true;
  private pointerX = 0;
  private pointerY = 0;

  constructor(
    world: RunWorld,
    document: ArchitectureDocument,
    private readonly elements: AcceptanceElements,
  ) {
    for (const spec of world.routes) this.routes.set(spec.id, new RuntimeRoute(spec));
    this.tour = buildDefaultTour(world, this.routes);

    this.scene.background = new THREE.Color(0x020406);
    this.scene.fog = new THREE.FogExp2(0x020607, 0.0085);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.2 : 1.55));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.elements.canvasHost.appendChild(this.renderer.domElement);

    const architecture = generateRouteFirstArchitecture(world, { seed: 4712, density: 0.82 });
    addScenePlan(this.scene, this.routes, architecture);
    addWireAccents(this.scene);
    addRouteRails(this.scene, this.routes);
    addSurface(this.scene);
    addSurfaceMirror(this.scene, document);

    const glow = new THREE.PointLight(0xff4054, 4.4, 40, 1.8);
    glow.position.set(0, SURFACE_Y + 1.5, 4);
    this.scene.add(glow);

    this.elements.playButton.addEventListener('click', this.togglePlay);
    this.elements.resetButton.addEventListener('click', this.reset);
    this.elements.scrub.addEventListener('input', this.scrub);
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.pointerMove, { passive: true });
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
    window.removeEventListener('pointermove', this.pointerMove);
    window.removeEventListener('keydown', this.keydown);
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.playing) {
      this.timeline = Math.min(1, this.timeline + dt / AUTO_DURATION);
      if (this.timeline >= 1) {
        this.playing = false;
        this.elements.playButton.textContent = 'Replay';
      }
    }

    const sample = this.timeline >= SURFACE_END
      ? sampleTour(this.tour, (this.timeline - SURFACE_END) / (1 - SURFACE_END))
      : null;

    this.updateCamera(sample);
    this.updateHud(sample);
    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(sample: TourSample | null): void {
    const pointerRight = this.pointerX * 0.42;
    const pointerUp = this.pointerY * 0.2;

    if (!sample) {
      const u = THREE.MathUtils.smoothstep(this.timeline / SURFACE_END, 0, 1);
      this.surfaceCamera.getPointAt(u, this.camera.position);
      const target = this.surfaceLook.getPointAt(THREE.MathUtils.clamp(u * 1.08, 0, 1));
      target.x += pointerRight;
      target.y += pointerUp;
      this.camera.lookAt(target);
      return;
    }

    sampleRouteFrameAtDistance(sample.route, sample.distance, this.frame);
    sampleRouteFrameAtDistance(
      sample.route,
      Math.min(sample.route.length, sample.distance + 9.5),
      this.lookFrame,
    );

    this.camera.position.copy(this.frame.position)
      .addScaledVector(this.frame.forward, -RUN_CAMERA_PROFILE.trailDistance)
      .addScaledVector(this.frame.up, RUN_CAMERA_PROFILE.upOffset)
      .addScaledVector(this.frame.right, 1.25 + pointerRight);

    const target = this.lookFrame.position.clone()
      .addScaledVector(this.lookFrame.right, pointerRight * 0.5)
      .addScaledVector(this.lookFrame.up, pointerUp);
    this.camera.lookAt(target);
  }

  private updateHud(sample: TourSample | null): void {
    const stage = stageFor(this.timeline, sample);
    this.elements.stage.textContent = stage.title;
    this.elements.detail.textContent = stage.detail;
    this.elements.progress.style.width = `${this.timeline * 100}%`;
    this.elements.scrub.value = String(this.timeline);
  }

  private togglePlay = (): void => {
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
    this.timeline = 0;
    this.playing = true;
    this.elements.playButton.textContent = 'Pause';
  };

  private scrub = (): void => {
    this.timeline = Number(this.elements.scrub.value);
    this.playing = false;
    this.elements.playButton.textContent = 'Run';
  };

  private pointerMove = (event: PointerEvent): void => {
    this.pointerX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
    this.pointerY = -(event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
  };

  private keydown = (event: KeyboardEvent): void => {
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
