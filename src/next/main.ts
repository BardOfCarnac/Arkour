import './styles.css';
import { acceptanceArchitectureDocument } from '../architecture/document/acceptance';
import { compileArchitectureDocument } from '../architecture/document/compile';
import { NextAcceptanceRuntime } from './runtime';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <main class="next-shell">
    <div class="viewport" id="viewport"></div>

    <div class="hud">
      <section class="panel title-panel">
        <strong>ARKOUR // NEXT ACCEPTANCE</strong>
        <span>ArchitectureDocument → routes → node machines → chassis → vertical city</span>
      </section>

      <section class="panel stage-panel">
        <span class="eyebrow">ROUTE-FIRST PRESENTATION</span>
        <strong id="stage">SURFACE APPROACH</strong>
        <small id="detail">EDITOR GRAPH MIRROR // ACCESS POINT AHEAD</small>
        <div class="progress"><i id="progress"></i></div>
      </section>

      <section class="panel note-panel">
        <b>This is not the old Run shell.</b><br />
        It uses the production route-first architecture pipeline with a new Three.js surface/descent presentation. All branches remain reserved even though this acceptance tour follows the default centre route.
      </section>

      <section class="controls" aria-label="Acceptance controls">
        <button id="play" type="button">Pause</button>
        <button id="reset" type="button">Reset</button>
        <input id="scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
      </section>

      <span class="corner-mark">NEXT // PRODUCTION PIPELINE</span>
    </div>
  </main>
`;

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const world = compileArchitectureDocument(acceptanceArchitectureDocument);
const runtime = new NextAcceptanceRuntime(world, acceptanceArchitectureDocument, {
  canvasHost: get('viewport'),
  stage: get('stage'),
  detail: get('detail'),
  progress: get('progress'),
  playButton: get<HTMLButtonElement>('play'),
  resetButton: get<HTMLButtonElement>('reset'),
  scrub: get<HTMLInputElement>('scrub'),
});

runtime.start();
