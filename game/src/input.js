// input.js — keyboard and mouse state for Costa Verde Heat.
// One shared Input object: keys currently held, keys pressed this frame,
// and the mouse position in screen space plus its button state.

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false },
};

const GAME_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ',
]);

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (GAME_KEYS.has(k)) e.preventDefault();
    if (!Input.keys.has(k)) Input.pressed.add(k);
    Input.keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    Input.keys.delete(e.key.toLowerCase());
  });
  window.addEventListener('blur', () => {
    Input.keys.clear();
    Input.mouse.down = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    Input.mouse.x = e.clientX - r.left;
    Input.mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      Input.mouse.down = true;
      Input.mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) Input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function endFrameInput() {
  Input.pressed.clear();
  Input.mouse.clicked = false;
}

export function keyDown(...names) {
  return names.some((n) => Input.keys.has(n));
}

export function keyPressed(...names) {
  return names.some((n) => Input.pressed.has(n));
}
