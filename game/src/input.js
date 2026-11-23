// input.js — keyboard and mouse state for Costa Verde Heat.
// One shared Input object: keys currently held, keys pressed this frame,
// and the mouse position in screen space plus its button state. v2 also
// tracks the right button and the wheel, and offers moveAxis() so the
// movement code never re-derives the WASD/arrows vector by hand.

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, rightDown: false, clicked: false },
  wheel: 0, // accumulated wheel delta since the last endFrameInput()
};

const GAME_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab',
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
    Input.mouse.rightDown = false;
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
    if (e.button === 2) Input.mouse.rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) Input.mouse.down = false;
    if (e.button === 2) Input.mouse.rightDown = false;
  });
  canvas.addEventListener('wheel', (e) => {
    Input.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function endFrameInput() {
  Input.pressed.clear();
  Input.mouse.clicked = false;
  Input.wheel = 0;
}

export function keyDown(...names) {
  return names.some((n) => Input.keys.has(n));
}

export function keyPressed(...names) {
  return names.some((n) => Input.pressed.has(n));
}

/** The WASD/arrows movement vector, normalised, as {x, y} in -1..1. */
export function moveAxis() {
  let x = 0;
  let y = 0;
  if (keyDown('w', 'arrowup')) y -= 1;
  if (keyDown('s', 'arrowdown')) y += 1;
  if (keyDown('a', 'arrowleft')) x -= 1;
  if (keyDown('d', 'arrowright')) x += 1;
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2;
    x *= inv;
    y *= inv;
  }
  return { x, y };
}
