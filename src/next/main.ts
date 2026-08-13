import './styles.css';
import { acceptanceArchitectureDocument } from '../architecture/document/acceptance';
import { compileArchitectureDocument } from '../architecture/document/compile';
import { attachRunnerCameraControls } from './camera-controls';
import { NextAcceptanceRuntime } from './runtime';
import { attachRunnerEntity } from './runner';
import { attachViewerMode } from './viewer';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <main class="next-shell">
    <div class="viewport" id="viewport"></div>
    <div class="spectator-viewport" id="spectator-viewport" aria-hidden="true"></div>

    <div class="hud">
      <section class="panel title-panel">
        <strong>ARKOUR // RUN</strong>
        <span>ArchitectureDocument → routes → node machines → chassis → vertical city</span>
      </section>

      <section class="panel stage-panel">
        <span class="eyebrow">ROUTE-FIRST RUN</span>
        <strong id="stage">SURFACE APPROACH</strong>
        <small id="detail">EDITOR GRAPH MIRROR // ACCESS POINT AHEAD</small>
        <div class="progress"><i id="progress"></i></div>
      </section>

      <section class="panel note-panel">
        <b>Player and table cameras are independent.</b><br />
        Player: drag to look, two-finger drag to lean. Table: drag to orbit, pinch/wheel to zoom, two-finger drag to pan.
      </section>

      <section id="encounter-gate" class="encounter-gate panel" aria-live="polite" hidden>
        <span class="eyebrow">ENCOUNTER HOLD</span>
        <strong id="encounter-title">NODE</strong>
        <small id="encounter-meta"></small>
        <button id="encounter-continue" class="encounter-continue" type="button">CONTINUE</button>
      </section>

      <section id="route-choice" class="route-choice panel" aria-live="polite" hidden>
        <span class="eyebrow">JUNCTION</span>
        <strong id="route-choice-title">CHOOSE ROUTE</strong>
        <div id="route-choice-buttons" class="route-choice-buttons"></div>
      </section>

      <section class="controls desktop-controls" aria-label="Run playback controls">
        <button id="view-mode" type="button" aria-pressed="false">View: Player</button>
        <button id="camera-reset" type="button">Centre</button>
        <button id="play" type="button">Pause</button>
        <button id="reset" type="button">Reset</button>
        <input id="scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
      </section>

      <section class="mobile-controls" aria-label="Mobile playback controls">
        <input id="mobile-scrub" class="mobile-scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
        <div class="mobile-camera-row">
          <button id="mobile-view-mode" class="mobile-view-mode" type="button" aria-pressed="false">VIEW: PLAYER</button>
          <button id="mobile-camera-reset" class="mobile-camera-reset" type="button">CENTRE</button>
        </div>
        <div class="mobile-button-row">
          <button id="mobile-back" class="mobile-step" type="button" aria-label="Back five seconds">−5s</button>
          <button id="mobile-play" class="mobile-primary" type="button" aria-label="Pause or resume">Ⅱ</button>
          <button id="mobile-forward" class="mobile-step" type="button" aria-label="Forward five seconds">+5s</button>
          <button id="mobile-reset" class="mobile-reset" type="button" aria-label="Restart run">↺</button>
        </div>
      </section>

      <span class="corner-mark">RUN // PRODUCTION</span>
    </div>
  </main>
`;

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const playButton = get<HTMLButtonElement>('play');
const resetButton = get<HTMLButtonElement>('reset');
const scrub = get<HTMLInputElement>('scrub');
const mobilePlay = get<HTMLButtonElement>('mobile-play');
const mobileScrub = get<HTMLInputElement>('mobile-scrub');
const viewButton = get<HTMLButtonElement>('view-mode');
const mobileViewButton = get<HTMLButtonElement>('mobile-view-mode');
const cameraResetButton = get<HTMLButtonElement>('camera-reset');
const mobileCameraResetButton = get<HTMLButtonElement>('mobile-camera-reset');

const world = compileArchitectureDocument(acceptanceArchitectureDocument);
const runtime = new NextAcceptanceRuntime(world, acceptanceArchitectureDocument, {
  canvasHost: get('viewport'),
  stage: get('stage'),
  detail: get('detail'),
  progress: get('progress'),
  playButton,
  resetButton,
  scrub,
  encounterGate: get('encounter-gate'),
  encounterTitle: get('encounter-title'),
  encounterMeta: get('encounter-meta'),
  encounterContinue: get<HTMLButtonElement>('encounter-continue'),
  routeChoice: get('route-choice'),
  routeChoiceTitle: get('route-choice-title'),
  routeChoiceButtons: get('route-choice-buttons'),
});
attachRunnerEntity(runtime);
const runnerCamera = attachRunnerCameraControls(runtime, get('viewport'));
const viewer = attachViewerMode(runtime, get('viewport'), get('spectator-viewport'));

const syncViewButtons = (): void => {
  const table = viewer.mode === 'spectator';
  viewButton.textContent = table ? 'View: Table' : 'View: Player';
  mobileViewButton.textContent = table ? 'VIEW: TABLE' : 'VIEW: PLAYER';
  cameraResetButton.textContent = table ? 'Follow' : 'Centre';
  mobileCameraResetButton.textContent = table ? 'FOLLOW' : 'CENTRE';
  viewButton.setAttribute('aria-pressed', String(table));
  mobileViewButton.setAttribute('aria-pressed', String(table));
};

const toggleView = (): void => {
  viewer.toggle();
  syncViewButtons();
};

const resetCameraView = (): void => {
  if (viewer.mode === 'spectator') viewer.resetView();
  else runnerCamera.resetView();
};

viewButton.addEventListener('click', toggleView);
mobileViewButton.addEventListener('click', toggleView);
cameraResetButton.addEventListener('click', resetCameraView);
mobileCameraResetButton.addEventListener('click', resetCameraView);
resetButton.addEventListener('click', () => {
  runnerCamera.resetView();
  viewer.resetView();
});
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'v') syncViewButtons();
  if (event.key.toLowerCase() === 'c') resetCameraView();
});

const syncMobilePlay = (): void => {
  const state = playButton.textContent?.trim().toLowerCase();
  mobilePlay.textContent = state === 'pause' ? 'Ⅱ' : '▶';
};

const syncMobileScrub = (): void => {
  mobileScrub.value = scrub.value;
};

const seekBySeconds = (seconds: number): void => {
  const next = Math.max(0, Math.min(1, Number(scrub.value) + seconds / 48));
  scrub.value = String(next);
  scrub.dispatchEvent(new Event('input', { bubbles: true }));
  syncMobileScrub();
  syncMobilePlay();
};

get<HTMLButtonElement>('mobile-back').addEventListener('click', () => seekBySeconds(-5));
get<HTMLButtonElement>('mobile-forward').addEventListener('click', () => seekBySeconds(5));
mobilePlay.addEventListener('click', () => {
  playButton.click();
  syncMobilePlay();
});
get<HTMLButtonElement>('mobile-reset').addEventListener('click', () => {
  resetButton.click();
  syncMobileScrub();
  syncMobilePlay();
});
mobileScrub.addEventListener('input', () => {
  scrub.value = mobileScrub.value;
  scrub.dispatchEvent(new Event('input', { bubbles: true }));
  syncMobilePlay();
});

new MutationObserver(syncMobilePlay).observe(playButton, { childList: true, characterData: true, subtree: true });
scrub.addEventListener('input', syncMobileScrub);
setInterval(syncMobileScrub, 120);

syncViewButtons();
syncMobilePlay();
syncMobileScrub();
runtime.start();
document.getElementById('boot-status')?.remove();
