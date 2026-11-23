// input.js — keyboard and mouse state for Costa Verde Heat.
// Tracks held keys, one-frame "hit" edges, and the mouse position in
// canvas coordinates so the player can aim with the cursor.

export function createInput(canvas) {
  const held = new Set();
  const hitEdges = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (e) => {
    if (!e.repeat) {
      held.add(e.code);
      hitEdges.add(e.code);
    }
    // Keep the page from scrolling while playing.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    mouse,
    down: (code) => held.has(code),
    hit: (code) => hitEdges.has(code),
    // Called once at the end of every frame to clear the edge sets.
    endFrame() {
      hitEdges.clear();
      mouse.clicked = false;
    },
  };
}
