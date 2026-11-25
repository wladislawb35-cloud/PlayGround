// Procedural pixel art. Every sprite is generated at boot and cached.

import { TILE, BUILDINGS, C } from './config.js';
import { hash2 } from './util.js';

const BUILD_PAD = 20;
const BUILD_TOP = 34;
const BUILD_TOP_TALL = 54;

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function px(ctx, x, y, color) {
  rect(ctx, x, y, 1, 1, color);
}

function pixelEllipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (half <= 0) continue;
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
  }
}

function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function checker(ctx, x, y, w, h, color, step = 2) {
  ctx.fillStyle = color;
  for (let yy = 0; yy < h; yy += step) {
    for (let xx = (yy / step) % 2 === 0 ? 0 : step; xx < w; xx += step * 2) {
      ctx.fillRect(x + xx, y + yy, Math.min(step, w - xx), Math.min(step, h - yy));
    }
  }
}

// ------------------------------------------------------------------ trees

function drawPine(ctx, w, h, palette, stage, seed) {
  const baseX = w / 2;
  const baseY = h - 6;
  const scale = h / 64;

  if (stage === 2) {
    // stump
    pixelEllipse(ctx, baseX, baseY + 2, 11, 4, 'rgba(20,30,18,.32)');
    rect(ctx, baseX - 6, baseY - 10, 12, 11, C.trunkDark);
    rect(ctx, baseX - 6, baseY - 13, 12, 4, C.trunk);
    rect(ctx, baseX - 4, baseY - 13, 8, 3, '#b58a5a');
    rect(ctx, baseX - 2, baseY - 13, 4, 2, '#8c633c');
    rect(ctx, baseX + 5, baseY - 8, 5, 3, C.trunk);
    return;
  }

  pixelEllipse(ctx, baseX + 2, baseY + 2, 13 * scale, 4.5 * scale, 'rgba(20,30,18,.30)');
  rect(ctx, baseX - 3, baseY - 18 * scale, 6, 17 * scale, C.trunkDark);
  rect(ctx, baseX - 2, baseY - 18 * scale, 2, 17 * scale, C.trunk);
  rect(ctx, baseX + 2, baseY - 14 * scale, 4, 3, C.trunk);

  const tiers = stage === 1 ? 2 : 3;
  const dark = palette[0];
  const mid = palette[1];
  const light = palette[2];
  const bright = palette[3];
  for (let i = 0; i < tiers; i++) {
    const top = (8 + i * 12) * scale;
    const bottom = (52 - i * 9) * scale;
    const half = (8 + i * 9) * scale;
    poly(
      ctx,
      [
        [baseX, top - 1],
        [baseX - half - 2, bottom + 1],
        [baseX + half + 2, bottom + 1],
      ],
      dark
    );
    poly(
      ctx,
      [
        [baseX, top + 3 * scale],
        [baseX - half, bottom - 3],
        [baseX + half, bottom - 3],
      ],
      mid
    );
    poly(
      ctx,
      [
        [baseX - 1, top + 5 * scale],
        [baseX - half + 2, bottom - 6],
        [baseX - 1, bottom - 7],
      ],
      light
    );
    if (stage === 0) {
      rect(ctx, baseX - half + 4, bottom - 10, 3, 2, bright);
      rect(ctx, baseX - half + 9, bottom - 14, 2, 2, bright);
    }
    // jagged branches
    rect(ctx, baseX - half - 1, bottom - 2, 4, 2, dark);
    rect(ctx, baseX + half - 2, bottom - 2, 4, 2, dark);
    for (let k = 0; k < 4; k++) {
      const hx = baseX - half + 3 + Math.floor(hash2(seed, i, k) * (half * 2 - 6));
      const hy = top + 8 + Math.floor(hash2(seed, i, k + 9) * (bottom - top - 14));
      px(ctx, hx, hy, dark);
    }
  }
  // tip
  rect(ctx, baseX - 1, 4 * scale, 2, 4, mid);
  px(ctx, baseX, 3 * scale, light);
}

function drawOak(ctx, w, h, palette, stage, seed) {
  const baseX = w / 2;
  const baseY = h - 6;
  if (stage === 2) {
    pixelEllipse(ctx, baseX, baseY + 1, 10, 4, 'rgba(20,30,18,.32)');
    rect(ctx, baseX - 5, baseY - 11, 10, 11, C.trunkDark);
    rect(ctx, baseX - 5, baseY - 14, 10, 4, C.trunk);
    rect(ctx, baseX - 3, baseY - 14, 6, 2, '#c1965f');
    return;
  }
  const r = stage === 1 ? 12 : 17;
  pixelEllipse(ctx, baseX + 2, baseY + 2, r + 1, 5, 'rgba(20,30,18,.30)');
  rect(ctx, baseX - 3, baseY - 20, 6, 19, C.trunkDark);
  rect(ctx, baseX - 2, baseY - 20, 2, 19, C.trunk);
  rect(ctx, baseX + 1, baseY - 15, 3, 2, C.trunkDark);
  // chunky canopy
  const cx = baseX;
  const cy = baseY - 30;
  const blobs = [
    [0, 0, r + 4, r - 1],
    [-r * 0.7, 2, r * 0.72, r * 0.7],
    [r * 0.7, 1, r * 0.7, r * 0.68],
    [-2, -r * 0.7, r * 0.75, r * 0.62],
    [3, r * 0.6, r * 0.75, r * 0.55],
  ];
  for (const [ox, oy, rx, ry] of blobs) pixelEllipse(ctx, cx + ox, cy + oy, rx, ry, palette[0]);
  for (const [ox, oy, rx, ry] of blobs) pixelEllipse(ctx, cx + ox - 1, cy + oy - 1, rx - 3, ry - 3, palette[1]);
  for (let i = 0; i < 12; i++) {
    const a = hash2(seed, i, 3) * Math.PI * 2;
    const rr = hash2(seed, i, 7) * r * 0.72;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.8 - 2;
    rect(ctx, x, y, 3, 2, palette[2]);
  }
  rect(ctx, cx - r * 0.5, cy - r * 0.55, 5, 3, palette[3]);
  rect(ctx, cx - r * 0.25, cy - r * 0.7, 3, 2, palette[3]);
  // leaf gaps
  px(ctx, cx + 4, cy + 7, palette[0]);
  px(ctx, cx - 7, cy + 4, palette[0]);
  if (stage === 1) {
    rect(ctx, baseX - 4, baseY - 27, 3, 7, palette[0]);
    rect(ctx, baseX + 2, baseY - 24, 2, 5, palette[0]);
  }
}

// ------------------------------------------------------------------ rocks

function drawRock(ctx, w, h, variant, seed) {
  const cx = w / 2;
  const base = h - 7;
  pixelEllipse(ctx, cx + 1, base + 2, 17, 4.5, 'rgba(20,25,18,.30)');
  if (variant === 0) {
    poly(
      ctx,
      [
        [cx - 18, base],
        [cx - 15, base - 12],
        [cx - 8, base - 21],
        [cx + 2, base - 24],
        [cx + 12, base - 18],
        [cx + 18, base - 8],
        [cx + 17, base],
      ],
      C.stoneDeep
    );
    poly(
      ctx,
      [
        [cx - 15, base - 2],
        [cx - 12, base - 13],
        [cx - 6, base - 19],
        [cx + 2, base - 21],
        [cx + 10, base - 15],
        [cx + 14, base - 7],
        [cx + 12, base - 2],
      ],
      C.stone
    );
    poly(
      ctx,
      [
        [cx - 11, base - 5],
        [cx - 8, base - 15],
        [cx - 2, base - 18],
        [cx + 1, base - 14],
        [cx - 3, base - 6],
      ],
      C.stoneLight
    );
    poly(
      ctx,
      [
        [cx + 3, base - 20],
        [cx + 9, base - 14],
        [cx + 12, base - 5],
        [cx + 5, base - 8],
      ],
      '#7c7e88'
    );
    rect(ctx, cx + 3, base - 12, 2, 7, C.stoneDeep);
    rect(ctx, cx + 5, base - 9, 3, 1, C.stoneDeep);
    rect(ctx, cx - 8, base - 4, 4, 2, C.stoneLight);
    // moss
    rect(ctx, cx - 12, base - 3, 5, 2, '#5d7c46');
    rect(ctx, cx + 8, base - 3, 4, 2, '#5d7c46');
    rect(ctx, cx - 4, base - 19, 3, 2, '#6f8f52');
  } else if (variant === 1) {
    for (let i = 0; i < 3; i++) {
      const ox = -13 + i * 10;
      const sy = base - 4 - hash2(seed, i, 2) * 8;
      poly(
        ctx,
        [
          [cx + ox - 8, sy + 4],
          [cx + ox - 5, sy - 7],
          [cx + ox + 2, sy - 9],
          [cx + ox + 8, sy - 2],
          [cx + ox + 6, sy + 4],
        ],
        i === 0 ? C.stoneDeep : C.stone
      );
      poly(
        ctx,
        [
          [cx + ox - 4, sy - 5],
          [cx + ox, sy - 8],
          [cx + ox + 4, sy - 3],
          [cx + ox - 1, sy - 1],
        ],
        C.stoneLight
      );
    }
    rect(ctx, cx - 10, base - 1, 20, 2, C.stoneDark);
  } else {
    poly(
      ctx,
      [
        [cx - 14, base],
        [cx - 12, base - 20],
        [cx - 4, base - 28],
        [cx + 7, base - 25],
        [cx + 13, base - 12],
        [cx + 12, base],
      ],
      C.stoneDeep
    );
    poly(
      ctx,
      [
        [cx - 10, base - 3],
        [cx - 8, base - 18],
        [cx - 2, base - 24],
        [cx + 6, base - 21],
        [cx + 9, base - 10],
        [cx + 7, base - 3],
      ],
      C.stone
    );
    poly(
      ctx,
      [
        [cx - 7, base - 6],
        [cx - 6, base - 17],
        [cx - 1, base - 21],
        [cx + 1, base - 19],
        [cx - 3, base - 6],
      ],
      C.stoneLight
    );
    rect(ctx, cx + 2, base - 17, 2, 9, C.stoneDeep);
    rect(ctx, cx - 5, base - 11, 2, 5, '#7c7e88');
    rect(ctx, cx - 9, base - 3, 7, 2, '#5d7c46');
    rect(ctx, cx + 3, base - 6, 5, 2, '#5d7c46');
  }
}

// ------------------------------------------------------------------ buildings

function buildingFrame(ctx, pad, top, fpw, fph) {
  // shadow + stone footing
  pixelEllipse(ctx, pad + fpw / 2 + 5, top + fph + 1, fpw * 0.52, 8, 'rgba(22,25,15,.32)');
  rect(ctx, pad + 2, top + fph - 10, fpw - 4, 10, '#6b6353');
  rect(ctx, pad + 2, top + fph - 10, fpw - 4, 3, '#89816c');
  for (let x = pad + 6; x < pad + fpw - 6; x += 10) {
    rect(ctx, x, top + fph - 7, 1, 5, '#524b3d');
  }
}

function chimney(ctx, x, y, smokeSeed) {
  rect(ctx, x, y, 11, 17, '#8d6049');
  rect(ctx, x, y, 11, 3, '#5d3a2a');
  rect(ctx, x + 1, y + 5, 3, 10, '#a97a5c');
  rect(ctx, x + 3, y, 5, 2, '#3b2419');
  px(ctx, x + 5, y - 2, 'rgba(220,215,200,.35)');
  return { x: x + 5, y: y };
}

function drawRoof(ctx, pad, top, fpw, fph, colors, opts = {}) {
  const eave = top + fph - 24;
  const topY = top - 10;
  const inset = opts.flat ? 4 : 10;
  const overhang = opts.overhang ?? 3;
  // dark outline
  poly(
    ctx,
    [
      [pad - overhang - 1, eave + 2],
      [pad + inset - 2, topY - 2],
      [pad + fpw - inset + 2, topY - 2],
      [pad + fpw + overhang + 1, eave + 2],
    ],
    C.ink
  );
  poly(
    ctx,
    [
      [pad - overhang, eave],
      [pad + inset, topY],
      [pad + fpw - inset, topY],
      [pad + fpw + overhang, eave],
    ],
    colors.dark
  );
  const ridgeY = topY + Math.round((eave - topY) * 0.42);
  // upper lit slope
  poly(
    ctx,
    [
      [pad + inset + 1, topY + 1],
      [pad + fpw - inset - 1, topY + 1],
      [pad + fpw - inset - 1, ridgeY],
      [pad + inset + 1, ridgeY],
    ],
    colors.light
  );
  // lower slope
  poly(
    ctx,
    [
      [pad + inset + 1, ridgeY],
      [pad + fpw - inset - 1, ridgeY],
      [pad + fpw + overhang - 2, eave - 1],
      [pad - overhang + 2, eave - 1],
    ],
    colors.base
  );
  // shingle rows
  for (let y = topY + 4; y < eave - 2; y += 5) {
    const t = (y - topY) / (eave - topY);
    const left = Math.round(pad + inset + (pad - overhang - pad - inset) * 0 + (t * (pad - overhang - (pad + inset))));
    const right = Math.round(pad + fpw - inset + t * ((pad + fpw + overhang) - (pad + fpw - inset)));
    ctx.fillStyle = y < ridgeY ? colors.dark : 'rgba(35,20,12,.18)';
    ctx.fillRect(left + 1, y, Math.max(0, right - left - 2), 1);
    for (let x = left + 4; x < right - 3; x += 8) {
      ctx.fillRect(x, y - 2, 1, 2);
    }
  }
  // ridge cap
  rect(ctx, pad + inset - 1, ridgeY - 1, fpw - inset * 2 + 2, 3, colors.trim);
  rect(ctx, pad + inset + 2, ridgeY, fpw - inset * 2 - 4, 1, 'rgba(255,240,200,.25)');
  // eave shadow
  rect(ctx, pad - overhang + 2, eave - 2, fpw + overhang * 2 - 4, 3, C.ink);
  rect(ctx, pad - overhang + 2, eave + 1, fpw + overhang * 2 - 4, 2, 'rgba(20,15,10,.22)');
  // roof edge highlights
  rect(ctx, pad + inset, topY, fpw - inset * 2, 1, colors.trim);
}

function drawWalls(ctx, pad, top, fpw, fph, opts = {}) {
  const eave = top + fph - 24;
  const wallH = fph - 24;
  const wallY = eave + 2;
  const inset = 5;
  rect(ctx, pad + inset, wallY, fpw - inset * 2, wallH, C.wallDark);
  rect(ctx, pad + inset + 2, wallY + 1, fpw - inset * 2 - 4, wallH - 4, opts.wall || C.wall);
  for (let y = wallY + 5; y < wallY + wallH - 3; y += 6) {
    rect(ctx, pad + inset + 2, y, fpw - inset * 2 - 4, 1, 'rgba(94,60,30,.32)');
  }
  // corner timbers
  rect(ctx, pad + inset, wallY, 4, wallH, C.timber);
  rect(ctx, pad + inset + fpw - inset * 2 - 4, wallY, 4, wallH, C.timber);
  rect(ctx, pad + inset, wallY, fpw - inset * 2, 3, C.timberDark);
  // door
  const doorW = opts.doorW || 14;
  const doorX = pad + fpw / 2 - doorW / 2;
  rect(ctx, doorX - 2, wallY + 4, doorW + 4, wallH - 4, C.timberDark);
  rect(ctx, doorX, wallY + 6, doorW, wallH - 6, opts.door || '#4a2d1b');
  rect(ctx, doorX + 1, wallY + 7, doorW - 2, 2, 'rgba(255,225,170,.12)');
  rect(ctx, doorX + doorW - 5, wallY + 12, 2, 2, C.gold);
  // windows
  const winY = wallY + 7;
  const wx = pad + inset + 7;
  if (!opts.noWindows) {
    for (const side of [wx, pad + fpw - inset - 17]) {
      rect(ctx, side, winY, 10, 9, C.timberDark);
      rect(ctx, side + 1, winY + 1, 8, 7, opts.window || '#f4ca6a');
      rect(ctx, side + 5, winY + 1, 1, 7, C.timberDark);
      rect(ctx, side + 1, winY + 4, 8, 1, C.timberDark);
      px(ctx, side + 2, winY + 2, '#fff1b8');
    }
  }
  // steps
  rect(ctx, doorX - 3, wallY + wallH - 2, doorW + 6, 4, '#7d7059');
  rect(ctx, doorX - 1, wallY + wallH + 2, doorW + 2, 3, '#92846b');
}

function drawLogPile(ctx, x, y, w = 20) {
  for (let i = 0; i < 3; i++) {
    rect(ctx, x, y - i * 5, w - i * 2, 5, C.trunkDark);
    rect(ctx, x + 1, y - i * 5 + 1, w - i * 2 - 2, 2, C.trunk);
    rect(ctx, x + w - i * 2 - 4, y - i * 5 + 1, 3, 3, '#c69a63');
  }
}

function drawCrates(ctx, x, y) {
  rect(ctx, x, y, 15, 14, C.timberDark);
  rect(ctx, x + 1, y + 1, 13, 12, '#b07a45');
  rect(ctx, x + 1, y + 5, 13, 2, C.timberDark);
  rect(ctx, x + 6, y + 1, 2, 12, C.timberDark);
  rect(ctx, x + 17, y + 4, 12, 11, C.timberDark);
  rect(ctx, x + 18, y + 5, 10, 9, '#9a6a3c');
  rect(ctx, x + 18, y + 8, 10, 2, C.timberDark);
}

function drawBarrel(ctx, x, y) {
  rect(ctx, x, y, 12, 15, '#5f3d24');
  rect(ctx, x + 1, y + 2, 10, 11, '#9a6a3c');
  rect(ctx, x, y + 4, 12, 2, '#3f2a18');
  rect(ctx, x, y + 10, 12, 2, '#3f2a18');
  rect(ctx, x + 3, y + 1, 1, 13, 'rgba(255,220,160,.18)');
}

function drawShed(ctx, pad, top, fpw, fph, roofColors) {
  drawRoof(ctx, pad, top, fpw, fph, roofColors);
  drawWalls(ctx, pad, top, fpw, fph);
}

function drawLumberjack(ctx, w, h, fpw, fph) {
  const pad = BUILD_PAD;
  const top = BUILD_TOP;
  buildingFrame(ctx, pad, top, fpw, fph);
  drawShed(ctx, pad, top, fpw, fph, {
    light: C.roofGreenLight,
    base: C.roofGreen,
    dark: C.roofGreenDark,
    trim: '#8bb175',
  });
  drawLogPile(ctx, pad + fpw - 4, top + fph - 2, 20);
  // axe leaning by the door
  rect(ctx, pad + 9, top + fph - 26, 2, 16, C.timber);
  rect(ctx, pad + 7, top + fph - 27, 7, 3, C.stoneLight);
  rect(ctx, pad + 7, top + fph - 27, 2, 3, '#7ab0c4');
  // woodpile inside yard
  drawLogPile(ctx, pad + 2, top + fph - 8, 16);
  // sign
  rect(ctx, pad + fpw - 12, top + fph - 28, 2, 12, C.timberDark);
  rect(ctx, pad + fpw - 19, top + fph - 33, 16, 8, C.timber);
  rect(ctx, pad + fpw - 17, top + fph - 31, 12, 4, '#c9a26b');
  px(ctx, pad + fpw - 12, top + fph - 30, C.timberDark);
  chimney(ctx, pad + fpw - 16, top - 4);
}

function drawQuarry(ctx, w, h, fpw, fph) {
  const pad = BUILD_PAD;
  const top = BUILD_TOP;
  // work yard
  pixelEllipse(ctx, pad + fpw / 2 + 3, top + fph + 1, fpw * 0.52, 8, 'rgba(22,25,15,.32)');
  rect(ctx, pad + 2, top + 10, fpw - 4, fph - 10, '#7d7059');
  rect(ctx, pad + 4, top + 12, fpw - 8, fph - 14, '#97876a');
  for (let i = 0; i < 14; i++) {
    const x = pad + 6 + hash2(i, 3, 1) * (fpw - 12);
    const y = top + 14 + hash2(i, 7, 2) * (fph - 18);
    rect(ctx, x, y, 2 + hash2(i, 1, 4) * 3, 2, i % 2 ? '#6f6350' : '#ab9a7e');
  }
  // the pit
  const cx = pad + fpw / 2;
  const cy = top + fph - 24;
  pixelEllipse(ctx, cx, cy, 25, 16, '#3e3529');
  pixelEllipse(ctx, cx, cy + 1, 21, 12, '#2a231a');
  pixelEllipse(ctx, cx - 2, cy + 4, 14, 6, '#1d1812');
  // rim stones
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * 26;
    const y = cy + Math.sin(a) * 15;
    rect(ctx, x - 3, y - 2, 7, 5, i % 2 ? C.stone : C.stoneLight);
    rect(ctx, x - 2, y - 2, 5, 2, '#cfd1d8');
  }
  // wooden crane
  const postX = pad + fpw - 16;
  const postY = top + 14;
  rect(ctx, postX, postY, 5, fph - 26, C.timberDark);
  rect(ctx, postX + 1, postY + 2, 3, fph - 28, C.timber);
  rect(ctx, postX - 18, postY + 2, 24, 4, C.timber);
  rect(ctx, postX - 18, postY + 2, 4, 9, C.timberDark);
  rect(ctx, postX - 16, postY + 6, 1, 12, '#2f2318');
  rect(ctx, postX - 18, postY + 18, 6, 5, '#8a6a48');
  rect(ctx, postX - 17, postY + 19, 4, 2, C.stoneLight);
  // small shed
  rect(ctx, pad + 3, top + 8, 24, 18, C.timberDark);
  rect(ctx, pad + 4, top + 9, 22, 16, C.roofBrownDark);
  rect(ctx, pad + 3, top + 5, 25, 5, C.roofBrown);
  rect(ctx, pad + 5, top + 6, 21, 2, C.roofBrownLight);
  rect(ctx, pad + 12, top + 19, 7, 6, '#2f2318');
  // stone piles
  poly(ctx, [[pad + 2, top + fph - 2], [pad + 6, top + fph - 13], [pad + 14, top + fph - 8], [pad + 16, top + fph - 2]], C.stone);
  poly(ctx, [[pad + 5, top + fph - 3], [pad + 8, top + fph - 10], [pad + 12, top + fph - 6], [pad + 12, top + fph - 3]], C.stoneLight);
  rect(ctx, pad + fpw - 22, top + fph - 8, 10, 6, C.stoneDark);
  rect(ctx, pad + fpw - 20, top + fph - 8, 6, 3, C.stone);
}

function drawHouse(ctx, w, h, fpw, fph, variant = 0) {
  const pad = BUILD_PAD;
  const top = BUILD_TOP;
  buildingFrame(ctx, pad, top, fpw, fph);
  const roofs = [
    { light: C.roofRedLight, base: C.roofRed, dark: C.roofRedDark, trim: '#e28a63' },
    { light: C.roofBrownLight, base: C.roofBrown, dark: C.roofBrownDark, trim: '#c89b64' },
    { light: '#7fa66b', base: '#5f8a50', dark: '#426438', trim: '#9bc183' },
  ];
  const roof = roofs[variant % roofs.length];
  drawRoof(ctx, pad + 3, top + 4, fpw - 6, fph - 4, roof);
  drawWalls(ctx, pad + 3, top + 4, fpw - 6, fph - 4, {
    wall: variant === 1 ? '#e3c794' : C.wall,
    door: '#4d2f1c',
  });
  // chimney and flower box
  chimney(ctx, pad + fpw - 21, top - 2);
  rect(ctx, pad + 13, top + fph - 27, 9, 3, C.timberDark);
  rect(ctx, pad + 14, top + fph - 28, 2, 1, '#e26b6b');
  rect(ctx, pad + 18, top + fph - 28, 2, 1, '#f0d264');
  // little fence
  for (let i = 0; i < 5; i++) {
    rect(ctx, pad - 2 + i * 5, top + fph - 9, 2, 9, '#c9a26b');
    rect(ctx, pad - 2 + i * 5, top + fph - 7, 2, 1, C.timberDark);
  }
  rect(ctx, pad - 2, top + fph - 5, 23, 1, C.timber);
}

function drawStorehouse(ctx, w, h, fpw, fph) {
  const pad = BUILD_PAD;
  const top = BUILD_TOP;
  buildingFrame(ctx, pad, top, fpw, fph);
  drawRoof(ctx, pad, top, fpw, fph, {
    light: C.roofBrownLight,
    base: C.roofBrown,
    dark: C.roofBrownDark,
    trim: '#d0a06a',
  });
  // big barn doors instead of windows
  const eave = top + fph - 24;
  const wallY = eave + 2;
  rect(ctx, pad + 5, wallY, fpw - 10, fph - 24, C.wallDark);
  rect(ctx, pad + 7, wallY + 1, fpw - 14, fph - 28, '#d5b37c');
  for (let y = wallY + 6; y < wallY + fph - 28; y += 6) rect(ctx, pad + 7, y, fpw - 14, 1, 'rgba(94,60,30,.3)');
  const dw = 30;
  const dx = pad + fpw / 2 - dw / 2;
  rect(ctx, dx - 2, wallY + 4, dw + 4, fph - 28, C.timberDark);
  rect(ctx, dx, wallY + 6, dw, fph - 32, '#8a5a33');
  rect(ctx, dx, wallY + 6, dw / 2 - 1, fph - 32, '#9c6a3e');
  rect(ctx, dx + dw / 2, wallY + 6, 1, fph - 32, C.timberDark);
  rect(ctx, dx + 3, wallY + 10, dw - 6, 2, C.timberDark);
  rect(ctx, dx + 3, wallY + 20, dw - 6, 2, C.timberDark);
  // hayloft door
  rect(ctx, pad + fpw / 2 - 6, top - 4, 12, 11, C.timberDark);
  rect(ctx, pad + fpw / 2 - 5, top - 3, 10, 9, '#6b4728');
  drawCrates(ctx, pad - 2, top + fph - 16);
  drawBarrel(ctx, pad + fpw - 14, top + fph - 17);
  drawBarrel(ctx, pad + fpw - 28, top + fph - 16);
  chimney(ctx, pad + fpw - 19, top - 6);
}

function drawWorkshop(ctx, w, h, fpw, fph) {
  const pad = BUILD_PAD;
  const top = BUILD_TOP;
  buildingFrame(ctx, pad, top, fpw, fph);
  drawRoof(ctx, pad, top, fpw, fph, {
    light: '#c69a64',
    base: '#a27844',
    dark: '#74512b',
    trim: '#e0b97e',
  });
  drawWalls(ctx, pad, top, fpw, fph, { wall: '#caa269' });
  // sawblade sign
  const sx = pad + fpw - 9;
  const sy = top + 14;
  pixelEllipse(ctx, sx, sy, 8, 8, C.stoneDark);
  pixelEllipse(ctx, sx, sy, 7, 7, C.stoneLight);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rect(ctx, sx + Math.cos(a) * 8 - 1, sy + Math.sin(a) * 8 - 1, 2, 2, C.stoneLight);
  }
  pixelEllipse(ctx, sx, sy, 2, 2, C.timberDark);
  // anvil and workbench outside
  rect(ctx, pad - 3, top + fph - 12, 20, 4, C.timberDark);
  rect(ctx, pad, top + fph - 16, 15, 5, '#4a4a52');
  rect(ctx, pad + 2, top + fph - 18, 10, 4, '#5f6069');
  rect(ctx, pad + 6, top + fph - 14, 3, 5, '#3a3a42');
  rect(ctx, pad + 2, top + fph - 9, 11, 2, '#2e2e34');
  // tools
  rect(ctx, pad + 18, top + fph - 22, 2, 16, C.timber);
  rect(ctx, pad + 15, top + fph - 23, 8, 2, C.stoneLight);
  rect(ctx, pad + 30, top + fph - 10, 12, 4, C.timber);
  rect(ctx, pad + 33, top + fph - 14, 6, 4, '#c8c8d0');
  chimney(ctx, pad + 16, top - 6);
}

function drawTownhall(ctx, w, h, fpw, fph) {
  const pad = BUILD_PAD;
  const top = BUILD_TOP_TALL;
  buildingFrame(ctx, pad, top, fpw, fph);
  // stone lower storey
  rect(ctx, pad + 2, top + fph - 34, fpw - 4, 32, '#8d8270');
  for (let y = top + fph - 30; y < top + fph - 4; y += 7) {
    rect(ctx, pad + 4, y, fpw - 8, 1, 'rgba(60,50,35,.4)');
    for (let x = pad + 6 + ((y / 7) % 2) * 7; x < pad + fpw - 6; x += 14) rect(ctx, x, y, 1, 7, 'rgba(60,50,35,.3)');
  }
  drawRoof(ctx, pad + 2, top + 6, fpw - 4, fph - 6, {
    light: C.roofBlueLight,
    base: C.roofBlue,
    dark: C.roofBlueDark,
    trim: '#93b8d8',
    overhang: 4,
  });
  drawWalls(ctx, pad + 2, top + 6, fpw - 4, fph - 6, {
    wall: '#dcc08c',
    door: '#3d2b1c',
    doorW: 20,
    window: '#ffe08a',
  });
  // tower
  const cx = pad + fpw / 2;
  rect(ctx, cx - 13, top - 32, 26, 44, C.ink);
  rect(ctx, cx - 12, top - 31, 24, 42, '#e0c590');
  rect(ctx, cx - 12, top - 31, 3, 42, '#c4a46f');
  rect(ctx, cx - 12, top - 31, 24, 4, '#f0dcb0');
  // clock
  pixelEllipse(ctx, cx, top - 14, 9, 9, C.gold);
  pixelEllipse(ctx, cx, top - 14, 7, 7, '#fff1cb');
  rect(ctx, cx, top - 20, 1, 7, C.ink);
  rect(ctx, cx, top - 14, 5, 1, C.ink);
  // tower roof + flag
  poly(ctx, [[cx - 16, top - 32], [cx, top - 52], [cx + 16, top - 32]], C.roofBlueDark);
  poly(ctx, [[cx - 13, top - 33], [cx, top - 49], [cx + 13, top - 33]], C.roofBlue);
  rect(ctx, cx - 2, top - 51, 2, 13, C.timberDark);
  rect(ctx, cx, top - 50, 13, 8, C.red);
  rect(ctx, cx, top - 50, 13, 2, C.redDark);
  rect(ctx, cx + 3, top - 47, 4, 2, C.gold);
  // banners
  for (const side of [pad + 3, pad + fpw - 23]) {
    rect(ctx, side, top + 40, 20, 15, C.redDark);
    rect(ctx, side + 2, top + 42, 16, 11, C.red);
    pixelEllipse(ctx, side + 10, top + 47, 4, 3, C.gold);
    rect(ctx, side + 2, top + 55, 16, 4, C.redDark);
    rect(ctx, side + 4, top + 57, 4, 3, C.red);
    rect(ctx, side + 12, top + 57, 4, 3, C.red);
  }
  // steps
  rect(ctx, pad + fpw / 2 - 16, top + fph, 32, 4, '#b6a888');
  rect(ctx, pad + fpw / 2 - 19, top + fph + 4, 38, 3, '#9b8d6f');
}

export function renderBuildingSprite(type) {
  const def = BUILDINGS[type];
  const fpw = def.w * TILE;
  const fph = def.h * TILE;
  const top = type === 'townhall' ? BUILD_TOP_TALL : BUILD_TOP;
  const w = fpw + BUILD_PAD * 2;
  const h = top + fph + 12;
  const { canvas, ctx } = makeCanvas(w, h);
  if (type === 'lumberjack') drawLumberjack(ctx, w, h, fpw, fph);
  else if (type === 'quarry') drawQuarry(ctx, w, h, fpw, fph);
  else if (type === 'house') drawHouse(ctx, w, h, fpw, fph);
  else if (type === 'storehouse') drawStorehouse(ctx, w, h, fpw, fph);
  else if (type === 'workshop') drawWorkshop(ctx, w, h, fpw, fph);
  else if (type === 'townhall') drawTownhall(ctx, w, h, fpw, fph);
  else drawHouse(ctx, w, h, fpw, fph);
  return { canvas, ox: -BUILD_PAD, oy: -top, pad: BUILD_PAD, top };
}

// ------------------------------------------------------------------ workers

const TUNICS = [
  { base: '#b8593c', dark: '#8a3c29', light: '#d37754' },
  { base: '#4f7f9f', dark: '#365c76', light: '#6c9fbf' },
  { base: '#728f45', dark: '#536d30', light: '#90ad60' },
  { base: '#8a5f9e', dark: '#654370', light: '#a87cba' },
];

export function renderWorker(variant, frame) {
  const { canvas, ctx } = makeCanvas(18, 26);
  const t = TUNICS[variant % TUNICS.length];
  pixelEllipse(ctx, 9, 23, 5, 2, 'rgba(20,25,15,.28)');
  const step = frame === 0 ? 0 : 2;
  // legs
  rect(ctx, 5, 18 - step, 3, 5, '#4a3826');
  rect(ctx, 10, 18 + step - 2, 3, 5, '#4a3826');
  rect(ctx, 5, 22, 3, 2, '#2f2318');
  rect(ctx, 10, 22, 3, 2, '#2f2318');
  // body
  rect(ctx, 4, 10, 10, 9, t.dark);
  rect(ctx, 5, 10, 8, 8, t.base);
  rect(ctx, 5, 10, 2, 8, t.light);
  rect(ctx, 4, 17, 10, 2, '#3a2a1a');
  // arms
  rect(ctx, 2, 11 + step, 2, 6, t.dark);
  rect(ctx, 14, 11 - step, 2, 6, t.dark);
  px(ctx, 2, 17 + step, C.skin);
  px(ctx, 15, 17 - step, C.skin);
  // head
  rect(ctx, 5, 3, 8, 7, C.skinDark);
  rect(ctx, 6, 3, 7, 6, C.skin);
  rect(ctx, 6, 3, 2, 2, C.skinDark);
  // cap
  rect(ctx, 4, 1, 10, 4, '#7a4e2c');
  rect(ctx, 4, 4, 11, 2, '#5d3a20');
  rect(ctx, 5, 1, 8, 2, '#96613a');
  rect(ctx, 12, 2, 4, 2, '#5d3a20');
  // eyes
  px(ctx, 8, 6, '#2a1b12');
  px(ctx, 11, 6, '#2a1b12');
  // belt
  rect(ctx, 5, 15, 8, 1, '#2f2015');
  rect(ctx, 8, 15, 2, 2, C.gold);
  return canvas;
}

export function renderBorderPine(variant, scale = 1) {
  const { canvas, ctx } = makeCanvas(56, 78);
  const palettes = [
    ['#1b3c25', '#24512f', '#2e6237', '#3c7742'],
    ['#173420', '#1f4729', '#285732', '#356b3b'],
    ['#1d3f26', '#275530', '#326539', '#417a46'],
  ];
  const p = palettes[variant % palettes.length];
  drawPine(ctx, 56, 78, p, 0, 11 + variant);
  return canvas;
}

// ------------------------------------------------------------------ icons

const iconCache = new Map();

function simpleIcon(name) {
  const { canvas, ctx } = makeCanvas(32, 32);
  if (name === 'wood') {
    for (let i = 0; i < 3; i++) {
      rect(ctx, 4 + i * 2, 20 - i * 6, 20 - i * 2, 6, C.trunkDark);
      rect(ctx, 5 + i * 2, 21 - i * 6, 18 - i * 2, 3, C.trunk);
      rect(ctx, 22 + i, 22 - i * 6, 4, 3, '#d6a86c');
      rect(ctx, 24 + i, 23 - i * 6, 1, 1, C.trunkDark);
    }
    rect(ctx, 4, 26, 24, 2, '#4a3020');
  } else if (name === 'stone') {
    poly(ctx, [[5, 25], [8, 12], [17, 7], [26, 13], [28, 25]], C.stoneDeep);
    poly(ctx, [[8, 23], [10, 14], [17, 10], [24, 15], [25, 23]], C.stone);
    poly(ctx, [[11, 20], [12, 14], [17, 11], [18, 16], [15, 20]], C.stoneLight);
    rect(ctx, 10, 23, 14, 2, C.stoneDark);
    rect(ctx, 19, 17, 1, 5, C.stoneDeep);
    rect(ctx, 8, 23, 5, 2, '#5d7c46');
  } else if (name === 'pop') {
    pixelEllipse(ctx, 16, 12, 7, 7, C.skinDark);
    pixelEllipse(ctx, 16, 12, 6, 6, C.skin);
    rect(ctx, 10, 5, 12, 4, '#7a4e2c');
    rect(ctx, 9, 8, 15, 2, '#5d3a20');
    poly(ctx, [[5, 28], [7, 20], [12, 17], [20, 17], [25, 20], [27, 28]], '#4f7f9f');
    rect(ctx, 12, 20, 8, 8, '#6c9fbf');
    px(ctx, 13, 12, '#2a1b12');
    px(ctx, 18, 12, '#2a1b12');
  } else if (name === 'idle') {
    rect(ctx, 7, 24, 18, 3, C.timber);
    rect(ctx, 9, 21, 3, 4, C.timberDark);
    rect(ctx, 20, 21, 3, 4, C.timberDark);
    rect(ctx, 15, 5, 3, 18, C.timber);
    rect(ctx, 13, 5, 10, 5, C.stoneLight);
    rect(ctx, 13, 5, 10, 2, '#c8cad2');
    rect(ctx, 22, 9, 2, 12, C.timber);
  } else if (name === 'axe') {
    rect(ctx, 14, 6, 3, 22, C.timber);
    rect(ctx, 11, 4, 13, 8, C.stoneLight);
    rect(ctx, 10, 6, 15, 4, C.stoneLight);
    rect(ctx, 19, 4, 5, 4, '#e2e4ea');
    rect(ctx, 11, 9, 6, 2, C.stoneDark);
  } else if (name === 'hammer') {
    rect(ctx, 15, 12, 3, 16, C.timber);
    rect(ctx, 8, 6, 16, 7, C.stoneDark);
    rect(ctx, 9, 7, 14, 4, C.stoneLight);
    rect(ctx, 15, 5, 3, 3, C.stoneDeep);
  } else if (name === 'coin') {
    pixelEllipse(ctx, 16, 16, 11, 11, C.goldDark);
    pixelEllipse(ctx, 16, 16, 9, 9, C.gold);
    rect(ctx, 14, 10, 4, 12, C.goldDark);
    rect(ctx, 11, 13, 10, 4, C.goldDark);
  } else if (name === 'clock') {
    pixelEllipse(ctx, 16, 16, 12, 12, C.timberDark);
    pixelEllipse(ctx, 16, 16, 10, 10, '#f6e7bb');
    rect(ctx, 15, 8, 2, 9, C.ink);
    rect(ctx, 16, 16, 7, 2, C.ink);
  } else {
    rect(ctx, 6, 6, 20, 20, C.paperDark);
    rect(ctx, 8, 8, 16, 16, C.ink);
  }
  return canvas;
}

function scaleToCanvas(source, size, cropTop = 0) {
  const { canvas, ctx } = makeCanvas(size, size);
  const sw = source.width;
  const sh = source.height - cropTop;
  const scale = Math.min((size - 2) / sw, (size - 2) / sh);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, cropTop, sw, sh, Math.round((size - dw) / 2), size - dh - 1, dw, dh);
  return canvas;
}

export function iconCanvas(name) {
  const key = String(name);
  if (iconCache.has(key)) return iconCache.get(key);
  let canvas;
  if (BUILDINGS[key]) {
    const sprite = sprites.buildings[key];
    canvas = scaleToCanvas(sprite.canvas, 48, 0);
  } else if (key === 'logo') {
    canvas = logoCanvas();
  } else if (key === 'pine') {
    const { canvas: c2, ctx } = makeCanvas(32, 32);
    drawPine(ctx, 32, 32, [C.leafDeep, C.leaf, C.leafMid, C.leafLight], 0, 4);
    canvas = c2;
  } else {
    canvas = simpleIcon(key);
  }
  iconCache.set(key, canvas);
  return canvas;
}

export function iconURL(name) {
  return iconCanvas(name).toDataURL('image/png');
}

function logoCanvas() {
  const { canvas, ctx } = makeCanvas(64, 64);
  poly(ctx, [[8, 4], [56, 4], [60, 10], [60, 54], [56, 60], [8, 60], [4, 54], [4, 10]], C.ink2);
  poly(ctx, [[10, 7], [54, 7], [57, 12], [57, 52], [54, 57], [10, 57], [7, 52], [7, 12]], C.goldDark);
  poly(ctx, [[13, 10], [51, 10], [54, 14], [54, 50], [51, 54], [13, 54], [10, 50], [10, 14]], '#2f5b37');
  // little pines
  drawPine(ctx, 28, 52, ['#173a22', '#21512c', '#2d6836', '#4b8a49'], 0, 3);
  poly(ctx, [[14, 46], [30, 12], [46, 46]], 'rgba(0,0,0,0)');
  rect(ctx, 16, 48, 32, 2, '#8a6a3e');
  // axe accent
  rect(ctx, 44, 16, 3, 16, '#c9a26b');
  rect(ctx, 40, 14, 11, 5, '#d9dbe2');
  rect(ctx, 40, 14, 4, 5, '#f3f4f8');
  return canvas;
}

// ------------------------------------------------------------------ registry

function buildRegistry() {
  const treePalettes = [
    ['#1c4929', '#2a6835', '#3b8643', '#5aa956'],
    ['#1f4a24', '#2c6b31', '#428b3e', '#66ad55'],
    ['#1a4026', '#245c2f', '#337539', '#4c974b'],
  ];
  const trees = [];
  for (let v = 0; v < 3; v++) {
    const stages = [];
    for (let stage = 0; stage < 3; stage++) {
      const { canvas, ctx } = makeCanvas(56, 72);
      if (v === 0) drawPine(ctx, 56, 72, treePalettes[v], stage, v);
      else drawOak(ctx, 56, 72, treePalettes[v], stage, v);
      stages.push(canvas);
    }
    trees.push(stages);
  }
  const rocks = [];
  for (let v = 0; v < 3; v++) {
    const { canvas, ctx } = makeCanvas(52, 44);
    drawRock(ctx, 52, 44, v, v);
    rocks.push(canvas);
  }
  const buildings = {};
  for (const type of Object.keys(BUILDINGS)) buildings[type] = renderBuildingSprite(type);
  const workers = [];
  for (let v = 0; v < TUNICS.length; v++) workers.push([renderWorker(v, 0), renderWorker(v, 1)]);
  const borderPines = [renderBorderPine(0), renderBorderPine(1), renderBorderPine(2)];
  const icons = {};
  for (const n of ['wood', 'stone', 'pop', 'idle', 'axe', 'hammer', 'coin', 'clock', 'logo', 'pine']) {
    icons[n] = iconCanvas(n);
  }
  return { trees, rocks, buildings, workers, borderPines, icons, TUNICS };
}

let sprites = null;
export function getSprites() {
  if (!sprites) sprites = buildRegistry();
  return sprites;
}
export { sprites };
