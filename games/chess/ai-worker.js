// games/chess/ai-worker.js — runs the chess engine off the main thread.
importScripts('engine.js');

self.onmessage = (e) => {
  const { id, moves, level } = e.data;
  const pos = new Chess.Position();
  for (const u of moves) {
    const m = pos.fromUci(u);
    if (!m) break;
    pos.make(m);
  }
  const r = Chess.think(pos, level, moves);
  self.postMessage({ id, move: r.move ? pos.uci(r.move) : null, score: r.score, depth: r.depth });
};
