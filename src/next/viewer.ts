import * as THREE from 'three';
import type { NextAcceptanceRuntime } from './runtime';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import { RuntimeRoute } from '../run/route';

const SURFACE_END = 0.275;
const RUNNER_LAYER = 1;

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

export interface ViewerController {
  mode: ViewMode;
  setMode(mode: ViewMode): void;
  toggle(): void;
  destroy(): void;
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
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
