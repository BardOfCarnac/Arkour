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

      <section class="controls desktop-controls" aria-label="Acceptance controls">
        <button id="play" type="button">Pause</button>
        <button id="reset" type="button">Reset</button>
        <input id="scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
      </section>

      <section class="mobile-controls" aria-label="Mobile acceptance controls">
        <input id="mobile-scrub" class="mobile-scrub" type="range" min="0" max="1" step="0.001" value="0" aria-label="Timeline" />
        <div class="mobile-button-row">
          <button id="mobile-back" class="mobile-step" type="button" aria-label="Back five seconds">−5s</button>
          <button id="mobile-play" class="mobile-primary" type="button" aria-label="Pause or resume">Ⅱ</button>
          <button id="mobile-forward" class="mobile-step" type="button" aria-label="Forward five seconds">+5s</button>
          <button id="mobile-reset" class="mobile-reset" type="button" aria-label="Restart tour">↺</button>
        </div>
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

const playButton = get<HTMLButtonElement>('play');
const resetButton = get<HTMLButtonElement>('reset');
const scrub = get<HTMLInputElement>('scrub');
const mobilePlay = get<HTMLButtonElement>('mobile-play');
const mobileScrub = get<HTMLInputElement>('mobile-scrub');

const world = compileArchitectureDocument(acceptanceArchitectureDocument);
const runtime = new NextAcceptanceRuntime(world, acceptanceArchitectureDocument, {
  canvasHost: get('viewport'),
  stage: get('stage'),
  detail: get('detail'),
  progress: get('progress'),
  playButton,
  resetButton,
  scrub,
});

const syncMobilePlay = (): void => {
  const state = playButton.textContent?.trim().toLowerCase();
  mobilePlay.textContent = state === 'pause' ? 'Ⅱ' : '▶';
};

const syncMobileScrub = (): void => {
  mobileScrub.value = scrub.value;
};

const seekBySeconds = (seconds: number): void => {
  // The current acceptance tour is 48 seconds long. Keeping this UI alias here
  // avoids coupling the production runtime to mobile-only presentation controls.
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

syncMobilePlay();
syncMobileScrub();
runtime.start();
