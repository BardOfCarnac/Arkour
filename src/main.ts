import './styles.css';
import { generateRouteFirstArchitecture } from './architecture/route-first';
import { RunRuntime } from './run/runtime';
import { createAcceptanceWorld } from './run/world';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <main class="run-shell">
    <div class="viewport" id="viewport"></div>

    <header class="top-hud" aria-label="Run status">
      <span class="brand">ARKOUR</span>
      <span id="route-name">BOOTING</span>
      <span class="state" id="run-state">TRANSIT</span>
    </header>

    <section class="encounter-hud" aria-live="polite">
      <strong id="encounter-name"></strong>
      <span id="encounter-meta"></span>
      <span class="range" id="encounter-range"></span>
    </section>

    <button class="theme-toggle" id="theme-toggle" type="button" aria-expanded="false" aria-controls="theme-panel">Theme</button>

    <aside class="theme-panel" id="theme-panel" aria-label="Image theme controls" hidden>
      <div class="theme-panel-head">
        <strong>Image theme</strong>
        <button id="theme-close" type="button" aria-label="Close image theme controls">Close</button>
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

      <button class="theme-reset" id="theme-reset" type="button">Reset demo field</button>
    </aside>

    <div class="branch-layer" id="branch-layer" aria-label="Route choices"></div>

    <footer class="bottom-hud">
      <button id="hold-button" type="button">Hold</button>
      <span class="action-pips" aria-label="NET actions"><i></i><i></i><i class="empty"></i><i class="empty"></i></span>
      <button id="pause-button" type="button">Pause</button>
    </footer>

    <pre class="debug" id="debug"></pre>
  </main>
`;

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const world = createAcceptanceWorld();
const architecture = generateRouteFirstArchitecture(world, { seed: 4712 });

const runtime = new RunRuntime(world, architecture, {
  canvasHost: get('viewport'),
  state: get('run-state'),
  route: get('route-name'),
  encounter: get('encounter-name'),
  encounterMeta: get('encounter-meta'),
  range: get('encounter-range'),
  branchLayer: get('branch-layer'),
  holdButton: get<HTMLButtonElement>('hold-button'),
  pauseButton: get<HTMLButtonElement>('pause-button'),
  debug: get('debug'),
});

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
  themeToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
};

const applyThemeSettings = (): void => {
  runtime.setTheme({
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
    await runtime.loadThemeImage(file);
    themeStatus.textContent = `${file.name} is driving the colour field.`;
  } catch (error) {
    console.error(error);
    themeStatus.textContent = 'That image could not be read. The previous field is still active.';
  }
});

themeReset.addEventListener('click', () => {
  themeImage.value = '';
  runtime.resetTheme();
  themeStatus.textContent = 'Using the built-in cyan / coral / cream demo field.';
});

applyThemeSettings();
runtime.start();
document.getElementById('boot-status')?.remove();
