// games/chess/pieces.js
// Classic Staunton-style chess pieces drawn as SVG (viewBox 0 0 45 45), original artwork for sillygames.
// ChessPieces.svg(type, color) → SVG markup; type: 'p','n','b','r','q','k'; color: 'w' | 'b'

(function (root) {
  'use strict';

  const BASE = 'M9.5 39.5h26a1.5 1.5 0 0 0 1.5-1.5v-1a1.5 1.5 0 0 0-1.5-1.5h-26A1.5 1.5 0 0 0 8 37v1a1.5 1.5 0 0 0 1.5 1.5z';

  // body shapes (filled) and detail strokes for each piece
  const SHAPES = {
    p: {
      fill: [
        BASE,
        'M12.5 35.5C13 31.5 16 29.6 18.5 28.8h8c2.5.8 5.5 2.7 6 6.7z',
        'M18.6 27.6c1-1.4 1.5-2.6 1.5-3.8h4.8c0 1.2.5 2.4 1.5 3.8z',
        'M16.3 28a6.2 1.8 0 1 0 12.4 0a6.2 1.8 0 1 0-12.4 0z',
        'M16.9 18.5a5.6 5.6 0 1 0 11.2 0a5.6 5.6 0 1 0-11.2 0z',
      ],
      detail: [],
    },
    r: {
      fill: [
        BASE,
        'M11.5 32.5h22a1 1 0 0 1 1 1v2h-24v-2a1 1 0 0 1 1-1z',
        'M14 32.5l1.5-15h14l1.5 15z',
        'M13.3 14.5h18.4a.8.8 0 0 1 .8.8v2.2h-20v-2.2a.8.8 0 0 1 .8-.8z',
        'M12.5 14.5V8.5H17v3h3.25v-3h4.5v3H28v-3h4.5v6z',
      ],
      detail: ['M15.4 20h14.2', 'M14.6 29.5h15.8'],
    },
    b: {
      fill: [
        BASE,
        'M14 35.5c1-3.5 4-5 6-5.5h5c2 .5 5 2 6 5.5z',
        'M16 29.3a6.5 1.7 0 1 0 13 0a6.5 1.7 0 1 0-13 0z',
        'M22.5 8.5c-5.5 4-7.7 10-7 14.5.5 3 2.5 4.5 3 4.8h8c.5-.3 2.5-1.8 3-4.8.7-4.5-1.5-10.5-7-14.5z',
        'M20.2 7.2a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0z',
      ],
      detail: ['M25.6 13.8l-5.2 6.6', 'M17.6 25.2h9.8'],
    },
    n: {
      fill: [
        BASE,
        'M12 31.2h21a1 1 0 0 1 1 1v3.3H11v-3.3a1 1 0 0 1 1-1z',
        'M15 31.2c.4-4.8 2.8-7.9 6.2-10.2-2.4.4-4.7 1.7-6.6 3.5-1.3 1.2-3.4.8-4-.9-.6-1.6 0-3.2 1.2-4.6 2.2-2.7 4.6-6.4 6.2-9.4l-.7-3.3 2.9 2 1.4-2.7 1.8 3c5.6 1.2 9.2 5.9 9 12.9-.1 4-1.2 7-1.9 9.7z',
      ],
      detail: ['M25.2 10.6c3.4 3 4.4 7.4 3.9 12.4'],
      dots: [[19.6, 13.4, 1.15], [13.1, 21.6, 0.7]],
    },
    q: {
      fill: [
        BASE,
        'M12.5 35.5c1-3.5 2.5-4.5 3.5-5h13c1 .5 2.5 1.5 3.5 5z',
        'M14.5 30a8 1.8 0 1 0 16 0a8 1.8 0 1 0-16 0z',
        'M14.5 29.5L11 13.5l5 8.5 1.5-11.5 3 10.5 2-11.5 2 11.5 3-10.5 1.5 11.5 5-8.5-3.5 16z',
        'M9.1 12.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
        'M15.6 9.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
        'M20.6 8.3a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
        'M25.6 9.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
        'M32.1 12.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
      ],
      detail: ['M15.3 26.4q7.2-2.2 14.4 0'],
    },
    k: {
      fill: [
        BASE,
        'M12.5 35.5c1-3.5 2.5-4.5 3.5-5h13c1 .5 2.5 1.5 3.5 5z',
        'M14.5 30a8 1.8 0 1 0 16 0a8 1.8 0 1 0-16 0z',
        'M14.5 29.5c-2.5-5.5-3-10 1-11.5 3-1 5.5 1 7 3.5 1.5-2.5 4-4.5 7-3.5 4 1.5 3.5 6 1 11.5z',
        'M19.4 19.6c0-3.6 1.5-5.1 3.1-5.1s3.1 1.5 3.1 5.1z',
        'M21.3 5h2.4v3h2.8v2.4h-2.8v3.8h-2.4v-3.8h-2.8V8h2.8z',
      ],
      detail: ['M15.3 26.4q7.2-2.2 14.4 0', 'M22.5 21.5v4'],
    },
  };

  const STYLE = {
    w: {
      grad: '<linearGradient id="GID" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#ece6d8"/><stop offset="1" stop-color="#c7bea9"/></linearGradient>',
      stroke: '#1d1d1d', sw: 1.5, detail: '#1d1d1d', dot: '#1d1d1d',
    },
    b: {
      grad: '<linearGradient id="GID" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#6e6e6e"/><stop offset="0.45" stop-color="#2c2c2c"/><stop offset="1" stop-color="#0c0c0c"/></linearGradient>',
      stroke: '#000000', sw: 1.3, detail: '#d9d9d9', dot: '#e8e8e8',
    },
  };

  function svg(type, color) {
    const sh = SHAPES[type], st = STYLE[color];
    const fills = sh.fill.map(d => `<path d="${d}"/>`).join('');
    const details = sh.detail.map(d => `<path d="${d}"/>`).join('');
    const dots = (sh.dots || []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    // soft highlight on the left for a 3D look
    const gid = 'cp' + type + color;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><defs>${st.grad.replace('GID', gid)}</defs>` +
      `<g fill="url(#${gid})" stroke="${st.stroke}" stroke-width="${st.sw}" stroke-linejoin="round" stroke-linecap="round">${fills}</g>` +
      `<g fill="none" stroke="${st.detail}" stroke-width="1.2" stroke-linecap="round">${details}</g>` +
      `<g fill="${st.dot}">${dots}</g></svg>`;
  }

  const ChessPieces = { svg };
  root.ChessPieces = ChessPieces;
  if (typeof module !== 'undefined' && module.exports) module.exports = ChessPieces;
})(typeof self !== 'undefined' ? self : this);
