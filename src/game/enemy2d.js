// @ts-nocheck

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function colorToRGBA(col, alpha) {
  if (col === 'white') return `rgba(255,255,255,${alpha})`;
  if (col === 'black') return `rgba(0,0,0,${alpha})`;
  const rgbMap = {
    yellow: '255,215,0',
    red: '220,20,60',
    green: '50,205,50',
    blue: '30,144,255',
    purple: '147,112,219',
    brown: '139,69,19',
    pink: '255,105,180',
  };
  const base = rgbMap[col] || '255,255,255';
  return `rgba(${base},${alpha})`;
}

export function initEnemyBlob(e) {
  const nodes = Number.isFinite(e.blobNodesCount) ? Math.max(10, Math.min(28, Math.floor(e.blobNodesCount))) : 18;
  const out = [];
  for (let i = 0; i < nodes; i++) {
    const a = (i / nodes) * Math.PI * 2;
    out.push({ a, r: e.radius, vr: 0 });
  }
  e.blobNodes = out;
  e.blobLastMs = performance.now();
}

export function updateEnemyBlob(e, nowMs) {
  const desiredNodes = Number.isFinite(e.blobNodesCount) ? Math.max(10, Math.min(28, Math.floor(e.blobNodesCount))) : 18;
  if (!e.blobNodes || e.blobNodes.length !== desiredNodes) initEnemyBlob(e);

  const dtFrames = clamp((nowMs - (e.blobLastMs || nowMs)) / 16.67, 0.5, 2.0);
  e.blobLastMs = nowMs;

  const r0 = e.radius;
  const seed = typeof e.blobSeed === 'number' ? e.blobSeed : (e.blobSeed = Math.random() * 1000);

  const velMag = Math.hypot(e.vx || 0, e.vy || 0);
  const vx = e.vx || 0;
  const vy = e.vy || 0;
  const inv = velMag > 1e-4 ? 1 / velMag : 0;
  const ux = vx * inv;
  const uy = vy * inv;

  // Squish amount scales with movement; make it obvious.
  const squishScale = Number.isFinite(e.blobSquishScale) ? clamp(e.blobSquishScale, 0.5, 1.25) : 1;
  const squish = clamp(velMag * 2.2 * squishScale, 0, r0 * 0.45);

  // Static asymmetry makes blobs feel like distinct "creatures".
  const biasAngle = Number.isFinite(e.blobBiasAngle) ? e.blobBiasAngle : 0;
  const biasMag = Number.isFinite(e.blobBiasMag) ? clamp(e.blobBiasMag, 0, 0.14) : 0;

  const noiseScale = Number.isFinite(e.blobNoiseScale) ? clamp(e.blobNoiseScale, 0.65, 1.35) : 1;
  const noiseMulA = Number.isFinite(e.blobNoiseMulA) ? clamp(e.blobNoiseMulA, 1.6, 3.6) : 2.4;
  const noiseMulB = Number.isFinite(e.blobNoiseMulB) ? clamp(e.blobNoiseMulB, 3.2, 6.0) : 4.2;
  const noiseTimeA = Number.isFinite(e.blobNoiseTimeA) ? clamp(e.blobNoiseTimeA, 240, 520) : 340;
  const noiseTimeB = Number.isFinite(e.blobNoiseTimeB) ? clamp(e.blobNoiseTimeB, 140, 340) : 190;

  const k = 0.22; // spring strength
  const damping = 0.72;

  for (let i = 0; i < e.blobNodes.length; i++) {
    const n = e.blobNodes[i];
    const nx = Math.cos(n.a);
    const ny = Math.sin(n.a);

    // Front compresses, back stretches.
    const align = nx * ux + ny * uy; // -1..1
    const stretch = -align * squish;

    // Small breathing noise so it feels alive even when standing.
    const noise =
      noiseScale *
      (0.16 * Math.sin(nowMs / noiseTimeA + seed * 0.9 + n.a * noiseMulA) +
        0.10 * Math.sin(nowMs / noiseTimeB + seed * 1.7 + n.a * noiseMulB));

    const asym = r0 * biasMag * Math.cos(n.a - biasAngle);
    const target = clamp(r0 * (1 + noise) + asym + stretch, r0 * 0.70, r0 * 1.38);
    const accel = (target - n.r) * k;
    n.vr = n.vr * damping + accel * dtFrames;
    n.r += n.vr * dtFrames;
  }
}

export function drawJellyBlobEnemy(ctx, e, nowMs, isNext) {
  const r = e.radius;
  if (!e.blobNodes) initEnemyBlob(e);

  const points = [];
  for (let i = 0; i < e.blobNodes.length; i++) {
    const n = e.blobNodes[i];
    points.push({ x: e.x + Math.cos(n.a) * n.r, y: e.y + Math.sin(n.a) * n.r });
  }

  // Smooth closed curve via quadratic midpoints
  ctx.save();
  if (isNext) {
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 16;
  }

  // Pseudo-3D: light from top-left with slight "movement" bias
  const velMag = Math.hypot(e.vx || 0, e.vy || 0);
  const bx = velMag > 0.2 ? clamp((e.vx || 0) / velMag, -1, 1) : 0;
  const by = velMag > 0.2 ? clamp((e.vy || 0) / velMag, -1, 1) : 0;
  const lightX = e.x - r * (0.40 + 0.12 * bx);
  const lightY = e.y - r * (0.50 + 0.12 * by);
  const baseMid = colorToRGBA(e.color, 0.98);
  const baseEdge = colorToRGBA(e.color, 0.22);
  const g = ctx.createRadialGradient(lightX, lightY, r * 0.12, e.x, e.y, r * 1.35);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.22, baseMid);
  g.addColorStop(1, baseEdge);

  ctx.fillStyle = g;
  ctx.beginPath();
  const p0 = points[0];
  ctx.moveTo(p0.x, p0.y);
  for (let i = 0; i < points.length; i++) {
    const p1 = points[(i + 1) % points.length];
    const mx = (points[i].x + p1.x) / 2;
    const my = (points[i].y + p1.y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.closePath();
  ctx.fill();

  // Additive inner glow (ONLY for the target yolk)
  if (isNext) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = colorToRGBA(e.color, 0.55);
    ctx.fill();
    ctx.restore();
  }

  // Gloss highlight (moves a bit)
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(lightX, lightY, r * 0.38, r * 0.24, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Rim light (bright border ONLY for the target yolk)
  ctx.save();
  if (isNext) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.70;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.70)';
  } else {
    // Non-targets: keep it subtle so enemies don't all look "glowy".
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  }
  ctx.stroke();
  ctx.restore();

  // Shield overlay for invulnerable yolks (non-targets).
  if (!isNext) {
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 180 + (e.blobSeed || 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + pulse * 0.22;
    ctx.strokeStyle = 'rgba(70, 247, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.12 + pulse * 0.12;
    ctx.fillStyle = 'rgba(40, 200, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(230, 255, 255, 0.9)';
    ctx.font = `${Math.max(10, r * 0.6)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛨', e.x, e.y);
    ctx.restore();
  }

  // Soft outer contour (keep it light so it doesn't look like a billiard ball)
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();

  // Priority ring (subtle pulse)
  if (isNext) {
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 220);
    ctx.globalAlpha = 0.12 + pulse * 0.12;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
