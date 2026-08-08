const toggle = document.querySelector('#tools-toggle');
const drawer = document.querySelector('#tools-drawer');
const closeButton = document.querySelector('#drawer-close');
const backdrop = document.querySelector('#drawer-backdrop');

if (!toggle || !drawer || !closeButton || !backdrop) {
  throw new Error('Pose Lab tools drawer is missing required DOM elements');
}

function setOpen(open) {
  document.body.classList.toggle('tools-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  drawer.setAttribute('aria-hidden', String(!open));
  backdrop.setAttribute('aria-hidden', String(!open));

  if (open) {
    requestAnimationFrame(() => drawer.querySelector('select, input, button')?.focus({ preventScroll: true }));
  } else {
    toggle.focus({ preventScroll: true });
  }
}

toggle.addEventListener('click', () => setOpen(true));
closeButton.addEventListener('click', () => setOpen(false));
backdrop.addEventListener('click', () => setOpen(false));

addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('tools-open')) {
    setOpen(false);
  }
});
