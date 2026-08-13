import type * as THREE from 'three';
import './styles.css';
import './theme-ui.css';
import { acceptanceArchitectureDocument } from '../architecture/document/acceptance';
import { compileArchitectureDocument } from '../architecture/document/compile';
import type { RuntimeRoute } from '../run/route';
import { SceneTheme } from '../run/theme';
import { NextAcceptanceRuntime } from './runtime';
import { attachRunnerEntity } from './runner';
import { attachViewerMode } from './viewer';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <main class="next-shell">
    <div class="viewport" id="viewport"></div>
    <div class="spectator-viewport" id="spectator-viewport" aria-hidden="true"></div>

    <button class="theme-toggle" id="theme-toggle" type="button" aria-expanded="false" aria-controls="theme-panel">THEME</button>

    <aside class="theme-panel" id="theme-panel" aria-label="Image theme controls" hidden>
      <div class="theme-panel-head">
        <div>
          <span class="theme-eyebrow">IMAGE FIELD</span>
          <strong>Theme</strong>
        </div>
        <button id="theme-close" type="button" aria-label="Close image theme controls">CLOSE</button>
      </div>

      <label class="theme-file">
        <span>Source image</span>
        <input id="theme-image" type="file" accept="image/*">
      </label>
      <p class="theme-note" id="theme-status">Using the built-in cyan / coral / cream demo field.</p>

      <label class="theme-control">
        <span>Theme strength</span>
        <input id="theme-strength" type="range" min="0" max="100" value="82">
      </label>
      <label class="theme-control">
        <span>Mottle strength</span>
        <input id="theme-mottle" type="range" min="0" max="100" value="68">
      </label>
      <label class="theme-control">
        <span>Mottle scale</span>
        <input id="theme-scale" type="range" min="0" max="100" value="46">
      </label>
      <label class="theme-control">
        <span>Dark lift</span>
        <input id="theme-lift" type="range" min="0" max="100" value="24">
      </label>

      <button class="theme-reset" id="theme-reset" type="button">RESET DEMO FIELD</button>
    </aside>

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
        <b>Runner and viewer cameras are separate.</b><br />
        V toggles the external spectator view without changing traversal state.
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
        <button id="view-mode" type="button" aria-pressed="false">View: Runner</button>
        <button id="play" type="button">Pause</button>
        <button id="reset" type="button">Reset</button>
        <input id="scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
      </section>

      <section class="mobile-controls" aria-label="Mobile playback controls">
        <input id="mobile-scrub" class="mobile-scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
        <button id="mobile-view-mode" class="mobile-view-mode" type="button" aria-pressed="false">VIEW: RUNNER</button>
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

// The production spectator viewer already bridges into the runtime's shared scene.
// Use the same narrow bridge here so the colour field themes the actual run scene.
const themeBridge = runtime as unknown as {
  scene: THREE.Scene;
  routes: Map<string, RuntimeRoute>;
};
const startRoute = themeBridge.routes.get(world.startRoute);
if (!startRoute) throw new Error(`Theme could not find start route: ${world.startRoute}`);
const sceneTheme = new SceneTheme(themeBridge.scene, startRoute);
sceneTheme.attach();

const themeToggle = get<HTMLButtonElement>('theme-toggle');
const themePanel = get<HTMLElement>('theme-panel');
const themeClose = get<HTMLButtonElement>('theme-close');
const themeImage = get<HTMLInputElement>('theme-image');
const themeStatus = get<HTMLElement>('theme-status');
const themeStrength = get<HTMLInputElement>('theme-strength');
const themeMottle = get<HTMLInputElement>('theme-mottle');
const themeScale = get<HTMLInputElement>('theme-scale');
const themeLift = get<HTMLInputElement>('theme-lift');
const themeReset = get<HTMLButtonElement>('theme-reset');

const setThemePanelOpen = (open: boolean): void => {
  themePanel.hidden = !open;
  themeToggle.setAttribute('aria-expanded', String(open));
};

const applyThemeSettings = (): void => {
  sceneTheme.setSettings({
    strength: Number(themeStrength.value) / 100,
    mottleStrength: Number(themeMottle.value) / 100,
    mottleScale: Number(themeScale.value) / 100,
    darkLift: Number(themeLift.value) / 100,
  });
};

themeToggle.addEventListener('click', () => setThemePanelOpen(themePanel.hidden));
themeClose.addEventListener('click', () => setThemePanelOpen(false));
for (const input of [themeStrength, themeMottle, themeScale, themeLift]) {
  input.addEventListener('input', applyThemeSettings);
}

themeImage.addEventListener('change', async () => {
  const file = themeImage.files?.[0];
  if (!file) return;
  themeStatus.textContent = 'Reducing image to a colour field…';
  try {
    await sceneTheme.loadImage(file);
    themeStatus.textContent = `${file.name} is driving the colour field.`;
  } catch (error) {
    console.error(error);
    themeStatus.textContent = 'That image could not be read. The previous field is still active.';
  }
});

themeReset.addEventListener('click', () => {
  themeImage.value = '';
  sceneTheme.resetField();
  themeStatus.textContent = 'Using the built-in cyan / coral / cream demo field.';
});

applyThemeSettings();
attachRunnerEntity(runtime);
const viewer = attachViewerMode(runtime, get('viewport'), get('spectator-viewport'));

const syncViewButtons = (): void => {
  const spectator = viewer.mode === 'spectator';
  viewButton.textContent = spectator ? 'View: Spectator' : 'View: Runner';
  mobileViewButton.textContent = spectator ? 'VIEW: SPECTATOR' : 'VIEW: RUNNER';
  viewButton.setAttribute('aria-pressed', String(spectator));
  mobileViewButton.setAttribute('aria-pressed', String(spectator));
};

const toggleView = (): void => {
  viewer.toggle();
  syncViewButtons();
};

viewButton.addEventListener('click', toggleView);
mobileViewButton.addEventListener('click', toggleView);
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'v') syncViewButtons();
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
