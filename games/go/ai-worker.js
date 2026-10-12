// games/go/ai-worker.js — runs the Go AI off the main thread.
importScripts('engine.js');

self.onmessage = (e) => {
  const msg = e.data;
  const board = GoEngine.replay(msg.n, msg.moves, msg.allowSuicide);
  if (msg.type === 'think') {
    const res = GoEngine.think(board, msg.komi, msg.opts || {});
    self.postMessage({ type: 'think', id: msg.id, ...res });
  } else if (msg.type === 'ownership') {
    const own = GoEngine.ownership(board, msg.komi, msg.playouts || 600, msg.budgetMs || 1500);
    self.postMessage({ type: 'ownership', id: msg.id, own: Array.from(own) });
  }
};
