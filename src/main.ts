import './styles.css';
import { generateArchitecture } from './architecture/generate';
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
const architecture = generateArchitecture(world, { seed: 4712 });

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

runtime.start();
