export const keys = {
  left: false,
  right: false,
};

const pressed = new Set();

window.addEventListener('keydown', e => {
  switch (e.code) {
    case 'ArrowLeft':  keys.left  = true; break;
    case 'ArrowRight': keys.right = true; break;
    case 'ArrowUp':
    case 'KeyZ':       pressed.add('jump');  break;
    case 'KeyX':
    case 'Space':      pressed.add('shoot'); e.preventDefault(); break;
    case 'Enter':      pressed.add('enter'); break;
    case 'ArrowDown':  e.preventDefault(); break;
  }
});

window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowLeft':  keys.left  = false; break;
    case 'ArrowRight': keys.right = false; break;
  }
});

// One-shot press detection — consumed on read
export function wasPressed(key) {
  if (pressed.has(key)) { pressed.delete(key); return true; }
  return false;
}
