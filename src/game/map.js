// @ts-nocheck

// Map module: defines obstacles and renders a cool background.
// Everything is in map/world coordinates (same coordinate space as player/enemies/bullets).

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function circleIntersectsRect(cx, cy, radius, r) {
  const closestX = clamp(cx, r.x, r.x + r.w);
  const closestY = clamp(cy, r.y, r.y + r.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export function resolveCircleVsRect(cx, cy, radius, r) {
  // Minimal push-out resolution. Returns {x,y,hit}.
  const closestX = clamp(cx, r.x, r.x + r.w);
  const closestY = clamp(cy, r.y, r.y + r.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= radius * radius) return { x: cx, y: cy, hit: false };

  // If center is exactly on the closest point, choose a direction based on penetration to edges.
  if (distSq < 1e-8) {
    const leftPen = Math.abs(cx - r.x);
    const rightPen = Math.abs(r.x + r.w - cx);
    const topPen = Math.abs(cy - r.y);
    const botPen = Math.abs(r.y + r.h - cy);

    const minPen = Math.min(leftPen, rightPen, topPen, botPen);
    if (minPen === leftPen) return { x: r.x - radius, y: cy, hit: true };
    if (minPen === rightPen) return { x: r.x + r.w + radius, y: cy, hit: true };
    if (minPen === topPen) return { x: cx, y: r.y - radius, hit: true };
    return { x: cx, y: r.y + r.h + radius, hit: true };
  }

  const dist = Math.sqrt(distSq);
  const push = radius - dist;
  const ux = dx / dist;
  const uy = dy / dist;
  return { x: cx + ux * push, y: cy + uy * push, hit: true };
}

export function createNeonMap({ w, h }) {
  // Cyberpunk city vibe.
  // Obstacles are small "street props" (crates, kiosks, cars, barriers) to add texture
  // without blocking the player/enemies into separate regions.

  const border = 28;

  const obstacles = [];

  // Border walls
  obstacles.push({ x: 0, y: 0, w, h: border });
  obstacles.push({ x: 0, y: h - border, w, h: border });
  obstacles.push({ x: 0, y: 0, w: border, h });
  obstacles.push({ x: w - border, y: 0, w: border, h });

  // --- Small obstacles (street props) ---
  const cx = w / 2;
  const cy = h / 2;

  // Keep a clear boulevard (a cross through the center) + a clear spawn area.
  const boulevardW = 300;
  const safeR = 220;

  function rectsOverlap(a, b, pad = 0) {
    return (
      a.x < b.x + b.w + pad &&
      a.x + a.w + pad > b.x &&
      a.y < b.y + b.h + pad &&
      a.y + a.h + pad > b.y
    );
  }

  // Deterministic RNG so the layout doesn't reshuffle every refresh.
  let seed = ((w * 73856093) ^ (h * 19349663) ^ 0x9e3779b9) >>> 0;
  function rand() {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >> 17;
    seed >>>= 0;
    seed ^= seed << 5;
    seed >>>= 0;
    return (seed >>> 0) / 4294967296;
  }

  const propTypes = [
    { kind: 'crate', w: 30, h: 26 },
    { kind: 'crate', w: 34, h: 30 },
    { kind: 'kiosk', w: 38, h: 38 },
    { kind: 'vent', w: 44, h: 28 },
    { kind: 'dumpster', w: 54, h: 34 },
    { kind: 'bollards', w: 52, h: 16 },
    { kind: 'barrier', w: 64, h: 18 },
    { kind: 'car', w: 86, h: 46 },
  ];

  const propCount = Math.floor(clamp((w * h) / 90000, 24, 80));
  const maxTries = 4000;

  let placed = 0;
  let tries = 0;
  while (placed < propCount && tries < maxTries) {
    tries++;
    const t = propTypes[Math.floor(rand() * propTypes.length)];
    const rw = t.w + Math.floor(rand() * 8);
    const rh = t.h + Math.floor(rand() * 8);

    // Place within bounds (avoid border walls).
    const x = Math.floor(border + 12 + rand() * (w - (border + 12) * 2 - rw));
    const y = Math.floor(border + 12 + rand() * (h - (border + 12) * 2 - rh));
    const r = { x, y, w: rw, h: rh, kind: t.kind };

    // Don't block the central boulevard cross.
    const rcx = r.x + r.w / 2;
    const rcy = r.y + r.h / 2;
    if (Math.abs(rcx - cx) < boulevardW / 2) continue;
    if (Math.abs(rcy - cy) < boulevardW / 2) continue;

    // Keep spawn area clear.
    if (Math.hypot(rcx - cx, rcy - cy) < safeR) continue;

    // Avoid overlaps (with padding) so it feels like props, not walls.
    let ok = true;
    for (const o of obstacles) {
      if (rectsOverlap(r, o, 10)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    obstacles.push(r);
    placed++;
  }

  // Keep obstacles within bounds
  for (const r of obstacles) {
    r.x = clamp(r.x, 0, w);
    r.y = clamp(r.y, 0, h);
    r.w = clamp(r.w, 0, w - r.x);
    r.h = clamp(r.h, 0, h - r.y);
  }

  function render(ctx, nowMs) {
    // City-ish background: dark asphalt grid, neon lane stripes, and small prop glow.
    const grid = 90;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = 'rgba(0,220,255,0.42)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Two neon boulevards (center cross) to guarantee connectivity + vibe.
    const t = nowMs / 900;
    const glow = 0.5 + 0.5 * Math.sin(t);
    ctx.globalAlpha = 0.12 + glow * 0.06;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,60,190,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    ctx.globalAlpha = 0.10 + glow * 0.06;
    ctx.strokeStyle = 'rgba(0,255,255,0.50)';
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();

    // Dashed lane markings
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, cy - 28);
    ctx.lineTo(w, cy - 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 28, 0);
    ctx.lineTo(cx - 28, h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // Obstacles (street props)
    for (const r of obstacles) {
      ctx.save();
      const kind = r.kind || 'wall';
      const neonA = kind === 'car' ? 'rgba(255,60,190,0.55)' : 'rgba(0,255,255,0.50)';
      const neonB = kind === 'kiosk' ? 'rgba(255,60,190,0.55)' : 'rgba(0,220,255,0.45)';

      ctx.shadowColor = neonA;
      ctx.shadowBlur = 10;
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, 'rgba(6,10,16,0.78)');
      g.addColorStop(1, 'rgba(20,32,48,0.78)');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = neonB;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      // tiny inner detail line
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
      ctx.restore();
    }
  }

  return {
    id: 'cyberpunk-city',
    name: 'Cyberpunk City',
    w,
    h,
    obstacles,
    render,
  };
}
