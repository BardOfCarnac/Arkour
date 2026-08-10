const STORAGE_KEY = 'arkour-black-ice-quadruped-editor-v1';

const buttons = Array.from(document.querySelectorAll('[data-preset-file]'));

async function loadPreset(button) {
  const originalLabel = button.textContent;
  buttons.forEach((candidate) => { candidate.disabled = true; });
  button.textContent = 'LOADING…';

  try {
    const response = await fetch(button.dataset.presetFile, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Preset request failed: ${response.status}`);
    const preset = await response.json();
    if (preset?.format !== 'arkour-black-ice-glyph' || preset?.version !== 2 || preset?.rig !== 'quadruped-15' || !preset?.points) {
      throw new Error('Preset is not a quadruped-15 glyph');
    }

    const next = {
      ...preset,
      preset: button.dataset.presetName || preset.preset || 'neutral',
      view: button.dataset.presetView || 'orbit',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    location.reload();
  } catch (error) {
    console.warn('Could not load quadruped preset', error);
    button.textContent = 'LOAD FAILED';
    setTimeout(() => {
      button.textContent = originalLabel;
      buttons.forEach((candidate) => { candidate.disabled = false; });
    }, 1200);
  }
}

buttons.forEach((button) => {
  button.addEventListener('click', () => loadPreset(button));
});
