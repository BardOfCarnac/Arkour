import * as THREE from 'three';
import type { NextAcceptanceRuntime } from './runtime';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import { RuntimeRoute } from '../run/route';

const SURFACE_END = 0.275;
const SPECTATOR_LAYER = 1;

const routeRed = 0xff4054;

type TourLeg = {
  route: RuntimeRoute;
  start: number;
  end: number;
};

type RuntimeBridge = {
  scene: THREE.Scene;
  routes: Map<string, RuntimeRoute>;
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

export interface ViewerController {
  mode: ViewMode;
  setMode(mode: ViewMode): void;
  toggle(): void;
  destroy(): void;
}

function routeLinePoints(route: RuntimeRoute): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const segment of route.spec.segments) {
    const from = new THREE.Vector3(...segment.from);
    const to = new THREE.Vector3(...segment.to);

    if (segment.kind === 'line') {
      if (points.length === 0 || !points[points.length - 1]?.equals(from)) points.push(from);
      points.push(to);
      continue;
    }

    const curve = new THREE.QuadraticBezierCurve3(
      from,
      new THREE.Vector3(...segment.control),
      to,
    );
    const sampled = curve.getPoints(24);
    if (points.length > 0 && sampled[0] && points[points.length - 1]?.equals(sampled[0])) sampled.shift();
    points.push(...sampled);
  }
  return points;
}

/**
 * The physical hard-route rail is useful in spectator view but can fill the
 * runner camera when viewed almost directly down its axis. Keep that physical
 * rail on the spectator layer and give the runner camera a one-pixel schematic
 * centreline instead. Route topology stays equally legible without near-camera
 * perspective turning a 20 cm cylinder into a giant red spear.
 */
function splitRoutePresentation(bridge: RuntimeBridge): THREE.Group {
  const physicalRails: THREE.Object3D[] = [];
  bridge.scene.traverse((object) => {
    if (object.name.startsWith('next-route:')) physicalRails.push(object);
  });
  for (const rail of physicalRails) rail.layers.set(SPECTATOR_LAYER);

  const runnerLines = new THREE.Group();
  runnerLines.name = 'arkour-runner-route-lines';
  const material = new THREE.LineBasicMaterial({
    color: routeRed,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  for (const route of bridge.routes.values()) {
    const points = routeLinePoints(route);
    if (points.length < 2) continue;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      material,
    );
    line.name = `runner-route:${route.id}`;
    line.layers.set(0);
    runnerLines.add(line);
  }

  bridge.scene.add(runnerLines);
  return runnerLines;
}

export function attachViewerMode(
  runtime: NextAcceptanceRuntime,
  runnerHost: HTMLElement,
  spectatorHost: HTMLElement,
): ViewerController {
  const bridge = runtime as unknown as RuntimeBridge;
  const runner = bridge.scene.getObjectByName('arkour-runner');
  if (!runner) throw new Error('Viewer mode requires the production Runner entity');

  runner.traverse((object) => object.layers.set(SPECTATOR_LAYER));
  const runnerRouteLines = splitRoutePresentation(bridge);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.1 : 1.45));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  spectatorHost.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.16, 950);
  camera.layers.enable(SPECTATOR_LAYER);

  const routeFrame = createRouteFrame();
  const target = new THREE.Vector3();
  let mode: ViewMode = 'runner';
  let raf = 0;

  const resize = (): void => {
    const width = spectatorHost.clientWidth;
    const height = spectatorHost.clientHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const updateSurfaceCamera = (): void => {
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

  const setMode = (next: ViewMode): void => {
    mode = next;
    runnerHost.classList.toggle('is-inactive', mode !== 'runner');
    spectatorHost.classList.toggle('is-active', mode === 'spectator');
    spectatorHost.setAttribute('aria-hidden', String(mode !== 'spectator'));
    (window as ViewerWindow).ArkourViewSnapshot = { mode };
    if (mode === 'spectator') resize();
  };

  const toggle = (): void => setMode(mode === 'runner' ? 'spectator' : 'runner');

  const keydown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'v') toggle();
  };

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keydown);
  resize();
  setMode('runner');
  raf = requestAnimationFrame(render);

  return {
    get mode() {
      return mode;
    },
    setMode,
    toggle,
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keydown);
      runnerRouteLines.removeFromParent();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
