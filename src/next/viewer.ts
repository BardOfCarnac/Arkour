import * as THREE from 'three';
import type { NextAcceptanceRuntime } from './runtime';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import { RuntimeRoute } from '../run/route';

const SURFACE_END = 0.275;
const RUNNER_LAYER = 1;
const TABLE_MIN_DISTANCE = 6.5;
const TABLE_MAX_DISTANCE = 32;
const TABLE_PAN_LIMIT = 8;
const TABLE_PITCH_LIMIT = Math.PI * 0.42;

type TourLeg = {
  route: RuntimeRoute;
  start: number;
  end: number;
};

type RuntimeBridge = {
  scene: THREE.Scene;
  tour: TourLeg[];
  timeline: number;
};

type RunnerSnapshot = {
  visible: boolean;
  routeId?: string;
  distance?: number;
};

type ViewMode = 'runner' | 'spectator';

type ViewerWindow = Window & {
  ArkourRunnerSnapshot?: RunnerSnapshot;
  ArkourViewSnapshot?: {
    mode: ViewMode;
  };
};

type PointerPoint = {
  x: number;
  y: number;
};

export interface ViewerController {
  mode: ViewMode;
  setMode(mode: ViewMode): void;
  toggle(): void;
  resetView(): void;
  destroy(): void;
}

function centroid(points: ReadonlyMap<number, PointerPoint>): PointerPoint | null {
  if (points.size < 2) return null;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const point of points.values()) {
    x += point.x;
    y += point.y;
    count += 1;
  }
  return count > 0 ? { x: x / count, y: y / count } : null;
}

function pinchDistance(points: ReadonlyMap<number, PointerPoint>): number | null {
  const pair = [...points.values()].slice(0, 2);
  if (pair.length < 2) return null;
  return Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
}

export function attachViewerMode(
  runtime: NextAcceptanceRuntime,
  runnerHost: HTMLElement,
  spectatorHost: HTMLElement,
): ViewerController {
  const bridge = runtime as unknown as RuntimeBridge;
  const runner = bridge.scene.getObjectByName('arkour-runner');
  if (!runner) throw new Error('Viewer mode requires the production Runner entity');

  runner.traverse((object) => object.layers.set(RUNNER_LAYER));

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.1 : 1.45));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  spectatorHost.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.16, 950);
  camera.layers.enable(RUNNER_LAYER);

  const routeFrame = createRouteFrame();
  const target = new THREE.Vector3();
  const orbitDirection = new THREE.Vector3();
  const surfaceForward = new THREE.Vector3(0, 0, 1);
  const surfaceRight = new THREE.Vector3(1, 0, 0);
  const surfaceUp = new THREE.Vector3(0, 1, 0);
  const pointers = new Map<number, PointerPoint>();

  let mode: ViewMode = 'runner';
  let raf = 0;
  let manualTable = false;
  let orbitYaw = 0;
  let orbitPitch = 0.32;
  let orbitDistance = 12;
  let panRight = 0;
  let panUp = 0;
  let previousCentroid: PointerPoint | null = null;
  let previousPinch: number | null = null;

  const resetView = (): void => {
    manualTable = false;
    orbitYaw = 0;
    orbitPitch = 0.32;
    orbitDistance = 12;
    panRight = 0;
    panUp = 0;
    previousCentroid = null;
    previousPinch = null;
  };

  const resize = (): void => {
    const width = spectatorHost.clientWidth;
    const height = spectatorHost.clientHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const applyManualOrbit = (
    position: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
  ): void => {
    target.copy(position)
      .addScaledVector(forward, 1.8)
      .addScaledVector(right, panRight)
      .addScaledVector(up, 0.25 + panUp);

    orbitDirection.copy(forward).multiplyScalar(-Math.cos(orbitYaw))
      .addScaledVector(right, Math.sin(orbitYaw));

    camera.position.copy(target)
      .addScaledVector(orbitDirection, Math.cos(orbitPitch) * orbitDistance)
      .addScaledVector(up, Math.sin(orbitPitch) * orbitDistance);
    camera.up.copy(up);
    camera.lookAt(target);
  };

  const updateSurfaceCamera = (): void => {
    if (manualTable) {
      applyManualOrbit(new THREE.Vector3(0, 8, 0), surfaceForward, surfaceRight, surfaceUp);
      return;
    }

    camera.position.set(-18, 18, -20);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 8, 0);
  };

  const updateSpectatorCamera = (now: number): void => {
    const snapshot = (window as ViewerWindow).ArkourRunnerSnapshot;
    if (!runner.visible || !snapshot?.visible || !snapshot.routeId || snapshot.distance === undefined) {
      updateSurfaceCamera();
      return;
    }

    const route = bridge.tour.find((leg) => leg.route.id === snapshot.routeId)?.route;
    if (!route) {
      updateSurfaceCamera();
      return;
    }

    sampleRouteFrameAtDistance(route, snapshot.distance, routeFrame);

    if (manualTable) {
      applyManualOrbit(routeFrame.position, routeFrame.forward, routeFrame.right, routeFrame.up);
      return;
    }

    const undergroundProgress = bridge.timeline >= SURFACE_END
      ? THREE.MathUtils.clamp((bridge.timeline - SURFACE_END) / (1 - SURFACE_END), 0, 1)
      : 0;
    const held = document.getElementById('encounter-gate')?.hidden === false;
    const orbit = held
      ? now * 0.00022
      : undergroundProgress * Math.PI * 1.15;
    const lateral = Math.cos(orbit) * 8.2;
    const lift = 4.4 + Math.sin(orbit) * 1.9;
    const back = 7.6 + Math.sin(orbit * 0.5) * 1.2;

    camera.position
      .copy(routeFrame.position)
      .addScaledVector(routeFrame.forward, -back)
      .addScaledVector(routeFrame.right, lateral)
      .addScaledVector(routeFrame.up, lift);
    camera.up.copy(routeFrame.up);
    target
      .copy(routeFrame.position)
      .addScaledVector(routeFrame.forward, 2.2)
      .addScaledVector(routeFrame.up, 0.25);
    camera.lookAt(target);
  };

  const render = (now: number): void => {
    if (mode === 'spectator') {
      updateSpectatorCamera(now);
      renderer.render(bridge.scene, camera);
    }
    raf = requestAnimationFrame(render);
  };

  const clearPointers = (): void => {
    pointers.clear();
    previousCentroid = null;
    previousPinch = null;
  };

  const setMode = (next: ViewMode): void => {
    mode = next;
    runnerHost.classList.toggle('is-inactive', mode !== 'runner');
    spectatorHost.classList.toggle('is-active', mode === 'spectator');
    spectatorHost.setAttribute('aria-hidden', String(mode !== 'spectator'));
    (window as ViewerWindow).ArkourViewSnapshot = { mode };
    clearPointers();
    if (mode === 'spectator') resize();
  };

  const toggle = (): void => setMode(mode === 'runner' ? 'spectator' : 'runner');

  const keydown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'v') toggle();
  };

  const pointerDown = (event: PointerEvent): void => {
    if (mode !== 'spectator') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    spectatorHost.setPointerCapture?.(event.pointerId);
    previousCentroid = centroid(pointers);
    previousPinch = pinchDistance(pointers);
    event.preventDefault();
  };

  const pointerMove = (event: PointerEvent): void => {
    if (mode !== 'spectator') return;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    manualTable = true;

    if (pointers.size === 1) {
      orbitYaw -= (event.clientX - previous.x) * 0.006;
      orbitPitch = THREE.MathUtils.clamp(
        orbitPitch - (event.clientY - previous.y) * 0.005,
        -TABLE_PITCH_LIMIT,
        TABLE_PITCH_LIMIT,
      );
      previousCentroid = null;
      previousPinch = null;
      event.preventDefault();
      return;
    }

    const nextCentroid = centroid(pointers);
    const nextPinch = pinchDistance(pointers);
    const panScale = orbitDistance * 0.0017;

    if (nextCentroid && previousCentroid) {
      panRight = THREE.MathUtils.clamp(
        panRight - (nextCentroid.x - previousCentroid.x) * panScale,
        -TABLE_PAN_LIMIT,
        TABLE_PAN_LIMIT,
      );
      panUp = THREE.MathUtils.clamp(
        panUp + (nextCentroid.y - previousCentroid.y) * panScale,
        -TABLE_PAN_LIMIT,
        TABLE_PAN_LIMIT,
      );
    }

    if (nextPinch !== null && previousPinch !== null) {
      orbitDistance = THREE.MathUtils.clamp(
        orbitDistance * Math.exp((previousPinch - nextPinch) * 0.01),
        TABLE_MIN_DISTANCE,
        TABLE_MAX_DISTANCE,
      );
    }

    previousCentroid = nextCentroid;
    previousPinch = nextPinch;
    event.preventDefault();
  };

  const pointerEnd = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (spectatorHost.hasPointerCapture?.(event.pointerId)) spectatorHost.releasePointerCapture(event.pointerId);
    previousCentroid = centroid(pointers);
    previousPinch = pinchDistance(pointers);
  };

  const wheel = (event: WheelEvent): void => {
    if (mode !== 'spectator') return;
    manualTable = true;
    orbitDistance = THREE.MathUtils.clamp(
      orbitDistance * Math.exp(event.deltaY * 0.0012),
      TABLE_MIN_DISTANCE,
      TABLE_MAX_DISTANCE,
    );
    event.preventDefault();
  };

  const doubleClick = (event: MouseEvent): void => {
    if (mode !== 'spectator') return;
    resetView();
    event.preventDefault();
  };

  const contextMenu = (event: MouseEvent): void => event.preventDefault();

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keydown);
  spectatorHost.addEventListener('pointerdown', pointerDown);
  spectatorHost.addEventListener('pointermove', pointerMove);
  spectatorHost.addEventListener('pointerup', pointerEnd);
  spectatorHost.addEventListener('pointercancel', pointerEnd);
  spectatorHost.addEventListener('wheel', wheel, { passive: false });
  spectatorHost.addEventListener('dblclick', doubleClick);
  spectatorHost.addEventListener('contextmenu', contextMenu);
  resize();
  setMode('runner');
  raf = requestAnimationFrame(render);

  return {
    get mode() {
      return mode;
    },
    setMode,
    toggle,
    resetView,
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keydown);
      spectatorHost.removeEventListener('pointerdown', pointerDown);
      spectatorHost.removeEventListener('pointermove', pointerMove);
      spectatorHost.removeEventListener('pointerup', pointerEnd);
      spectatorHost.removeEventListener('pointercancel', pointerEnd);
      spectatorHost.removeEventListener('wheel', wheel);
      spectatorHost.removeEventListener('dblclick', doubleClick);
      spectatorHost.removeEventListener('contextmenu', contextMenu);
      renderer.dispose();
      renderer.domElement.remove();
      clearPointers();
    },
  };
}
