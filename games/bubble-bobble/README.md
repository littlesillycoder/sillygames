# Bubble Bobble Classic

A browser-based recreation of the classic 1986 Taito arcade game, built with pure HTML5 Canvas and vanilla JavaScript.

## How to Play

Open `index.html` via a local server (required for ES6 modules):

```
python3 -m http.server 8765
# then open http://localhost:8765
```

## Controls

| Key | Action |
|-----|--------|
| ← → | Move left / right |
| ↑ or Z | Jump |
| X or Space | Shoot bubble |
| Enter | Start / Restart |

## Gameplay

1. **Shoot bubbles** at enemies to trap them inside
2. **Jump onto** the trapped bubble to pop it — the enemy turns into fruit
3. **Collect the fruit** before it disappears for points
4. **Clear all enemies** to advance to the next level
5. Watch out — if you don't pop a bubble within 5 seconds, the enemy escapes **angrier and faster!**

## Scoring

| Fruit | Points |
|-------|--------|
| Banana | 100 |
| Strawberry | 200 |
| Pineapple | 500 |
| Cherry | 1000 |

## Features

- 3 levels with unique platform layouts and brick colours
- Enemy AI: patrol, chase, jump, escape, and angry states
- Web Audio API synthesised sound effects (no audio files needed)
- HUD: score, hi-score, level, remaining lives
- Pure Canvas 2D rendering — no images, no frameworks
