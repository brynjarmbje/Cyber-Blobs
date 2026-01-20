// @ts-nocheck
// Lightweight 2.5D renderer (top-down) using Three.js.
// Keeps gameplay logic in 2D world coords; renders in a WebGL overlay canvas.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function colorToThree(c) {
  // Accepts CSS color names used by the game.
  const map = {
    yellow: 0xffd700,
    red: 0xdc143c,
    green: 0x32cd32,
    blue: 0x1e90ff,
    purple: 0x9370db,
    brown: 0x8b4513,
    pink: 0xff69b4,
    white: 0xffffff,
    black: 0x000000,
    magenta: 0xff00ff,
    cyan: 0x00ffff,
    orange: 0xffa500,
    gold: 0xffd700,
    dodgerblue: 0x1e90ff,
    crimson: 0xdc143c,
  };
  return new THREE.Color(map[c] ?? 0xffffff);
}

export function createRenderer3D(glCanvas) {
  if (!glCanvas) return null;

  const CAMERA_TILT = 0.22; // ~12.6deg (subtle isometric feel)

  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  // Keep the playfield opaque so the page's animated CSS background can't bleed through.
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();

  // Non-tilted background group (sky/planets). Keep it separate from world tilt.
  const bgGroup = new THREE.Group();
  bgGroup.renderOrder = -100;
  scene.add(bgGroup);

  // Tilt the WORLD (not the camera) so we keep perfect camera-follow behavior
  // while still seeing the sides of 3D boxes/buildings.
  const worldPivot = new THREE.Group();
  worldPivot.rotation.x = CAMERA_TILT;
  const worldRoot = new THREE.Group();
  worldPivot.add(worldRoot);
  scene.add(worldPivot);

  // Environment reflections (critical for glass/jelly materials).
  // Keeps background transparent (renderer alpha=true) while still providing lighting cues.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  // Centered orthographic camera (y-up). We'll map the game's y-down screen coords
  // to y-up view coords in the render step. This avoids tilt-induced drift.
  let viewW = 800;
  let viewH = 600;
  const camera = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, -3000, 3000);
  camera.position.set(0, 0, 900);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // Lighting
  const hemi = new THREE.HemisphereLight(0x7de9ff, 0x170a2e, 0.9);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.20);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(-350, -400, 900);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xff4bd8, 0.55);
  fill.position.set(400, 200, 600);
  scene.add(fill);

  // Player-following key light: makes obstacle faces change as you move around them.
  // (Camera stays fixed top-down, but lighting cues still give a "walking around buildings" feel.)
  const playerKey = new THREE.DirectionalLight(0xbfe9ff, 0.65);
  const playerKeyTarget = new THREE.Object3D();
  scene.add(playerKeyTarget);
  playerKey.target = playerKeyTarget;
  playerKey.position.set(200, -200, 520);
  scene.add(playerKey);

  // Small moving point light to create lively specular "glints" on jelly.
  const glint = new THREE.PointLight(0xffffff, 1.15, 900, 2.0);
  glint.position.set(420, 280, 260);
  scene.add(glint);

  // Background textures (space-themed)
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 256;
  gridCanvas.height = 256;
  const gctx = gridCanvas.getContext('2d');

  const emiCanvas = document.createElement('canvas');
  emiCanvas.width = 256;
  emiCanvas.height = 256;
  const ectx = emiCanvas.getContext('2d');

  function rand2(x, y) {
    // Deterministic-ish hash for texture detail
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function seeded01(seed) {
    const n = Math.sin(seed * 999.123) * 43758.5453;
    return n - Math.floor(n);
  }

  function makePlanetTexture(seed, size = 512) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.46;

    // Base planet gradient
    const hue = 190 + Math.floor(seeded01(seed + 1.2) * 140);
    const hue2 = (hue + 30 + Math.floor(seeded01(seed + 2.2) * 60)) % 360;
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.15, cx, cy, r);
    g.addColorStop(0, `hsl(${hue}, 80%, 60%)`);
    g.addColorStop(1, `hsl(${hue2}, 60%, 26%)`);

    ctx.fillStyle = '#0000';
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // Bands / surface detail
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 18; i++) {
      const yy = cy - r + (i / 18) * (r * 2);
      const w = 0.10 + 0.10 * seeded01(seed + i * 0.7);
      const a = 0.05 + 0.05 * seeded01(seed + i * 1.3);
      ctx.fillStyle = `hsla(${(hue + i * 7) % 360}, 70%, 70%, ${a})`;
      ctx.fillRect(0, yy, size, r * w);
    }

    // Craters / spots
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 28; i++) {
      const ang = seeded01(seed + i * 2.1) * Math.PI * 2;
      const rr = r * Math.sqrt(seeded01(seed + i * 3.1)) * 0.92;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      const cr = r * (0.018 + 0.055 * seeded01(seed + i * 4.1));
      const cg = ctx.createRadialGradient(x - cr * 0.2, y - cr * 0.2, 1, x, y, cr);
      cg.addColorStop(0, 'rgba(255,255,255,0.55)');
      cg.addColorStop(1, 'rgba(0,0,0,0.0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Atmosphere rim
    const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.06);
    rim.addColorStop(0, 'rgba(255,255,255,0.0)');
    rim.addColorStop(0.6, 'rgba(255,255,255,0.0)');
    rim.addColorStop(1, `hsla(${hue}, 90%, 70%, 0.65)`);
    ctx.strokeStyle = rim;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    // Shadow terminator (gives sphere depth)
    const sh = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)');
    sh.addColorStop(0.35, 'rgba(0,0,0,0.25)');
    sh.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Optional rings
    if (seeded01(seed + 7.7) > 0.62) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.25 + (seeded01(seed + 8.1) - 0.5) * 0.55);
      ctx.globalCompositeOperation = 'screen';
      const rw = r * (1.55 + 0.30 * seeded01(seed + 8.8));
      const rh = r * (0.42 + 0.14 * seeded01(seed + 9.2));
      const rg = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, rw);
      rg.addColorStop(0, 'rgba(255,255,255,0.0)');
      rg.addColorStop(0.55, `hsla(${hue2}, 85%, 70%, 0.14)`);
      rg.addColorStop(1, 'rgba(255,255,255,0.0)');
      ctx.strokeStyle = rg;
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Mask outside
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    return tex;
  }

  function paintGrid() {
    gctx.clearRect(0, 0, 256, 256);
    ectx.clearRect(0, 0, 256, 256);

    // User request: background should be ONLY black + planets.
    gctx.fillStyle = '#000000';
    gctx.fillRect(0, 0, 256, 256);
  }
  paintGrid();

  const gridTex = new THREE.CanvasTexture(gridCanvas);
  gridTex.wrapS = THREE.RepeatWrapping;
  gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(1, 1);
  gridTex.colorSpace = THREE.SRGBColorSpace;

  const emiTex = new THREE.CanvasTexture(emiCanvas);
  emiTex.wrapS = THREE.RepeatWrapping;
  emiTex.wrapT = THREE.RepeatWrapping;
  emiTex.repeat.set(1, 1);
  emiTex.colorSpace = THREE.SRGBColorSpace;

  const groundMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x000000),
  });
  const groundGeo = new THREE.PlaneGeometry(800, 600);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, 0, 0);
  worldRoot.add(ground);

  // Space theme: ground is subtle; planets and asteroids carry the wow.

  // --- Planets (background) ---
  function makePlanetGlowTexture(size = 256) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.48;

    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.40)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.10)');
    g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    return tex;
  }

  const planetGlowTex = makePlanetGlowTexture(256);

  const planetGeo = new THREE.PlaneGeometry(1, 1);
  const planetBaseMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    depthTest: false,
  });
  const planetGlowBaseMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: planetGlowTex,
    transparent: true,
    alphaTest: 0.02,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const planets = [];
  let planetsReady = false;

  function initPlanets(mapW, mapH) {
    if (planetsReady) return;
    planetsReady = true;

    // 8 big planets spread across the MAP.
    const count = 8;
    const triesPerPlanet = 60;
    const margin = 180;

    const placed = [];
    for (let i = 0; i < count; i++) {
      const seed = 10.5 + i * 77.3;
      const radius = 220 + 170 * seeded01(seed + 3.1);
      const parallax = 1.0;
      const z = -1050 - 450 * seeded01(seed + 5.1);

      let x = mapW * 0.5;
      let y = mapH * 0.5;
      for (let t = 0; t < triesPerPlanet; t++) {
        const s = seed + t * 13.7;
        x = margin + (mapW - margin * 2) * seeded01(s + 1.1);
        y = margin + (mapH - margin * 2) * seeded01(s + 2.1);

        let ok = true;
        for (const p of placed) {
          const dx = x - p.x;
          const dy = y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < (radius + p.r) * 1.25) {
            ok = false;
            break;
          }
        }
        if (ok) break;
      }
      placed.push({ x, y, r: radius });

      const tex = makePlanetTexture(seed, 512);
      const mat = planetBaseMat.clone();
      mat.map = tex;

      const mesh = new THREE.Mesh(planetGeo, mat);
      mesh.renderOrder = -59;
      mesh.position.z = z;
      mesh.rotation.z = (seeded01(seed + 6.1) - 0.5) * 0.8;
      bgGroup.add(mesh);

      const glow = new THREE.Mesh(planetGeo, planetGlowBaseMat.clone());
      glow.renderOrder = -60;
      glow.position.z = z - 0.1;
      glow.rotation.z = mesh.rotation.z;
      bgGroup.add(glow);

      planets.push({
        x,
        y,
        r: radius,
        p: parallax,
        mesh,
        glow,
      });
    }
  }

  // --- Asteroid obstacles (pooled) ---
  function makeRockVariant(seed) {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n =
        Math.sin(x * 4.1 + seed) * 0.33 +
        Math.sin(y * 5.3 - seed * 0.7) * 0.27 +
        Math.sin(z * 6.2 + seed * 1.3) * 0.22;
      const s = 1.0 + 0.18 * n;
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  const rockGeos = [];
  const rockEdgeGeos = [];
  for (let i = 0; i < 8; i++) {
    const g = makeRockVariant(12.3 + i * 9.7);
    rockGeos.push(g);
    rockEdgeGeos.push(new THREE.EdgesGeometry(g, 18));
  }

  const rockMatBase = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2b2f38),
    roughness: 0.95,
    metalness: 0.08,
    envMapIntensity: 0.55,
  });
  const rockEdgeMatBase = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xbfe9ff),
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });

  const crystalGeo = new THREE.ConeGeometry(0.28, 1.0, 6, 1);
  const crystalMatBase = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.15,
    metalness: 0.0,
    transmission: 0.35,
    thickness: 0.6,
    ior: 1.38,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.55,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.25,
  });
  const crystalGlowMatBase = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffffff),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
  });

  const obstacleGroups = [];

  function ensureAsteroidPool(count) {
    while (obstacleGroups.length < count) {
      const idx = obstacleGroups.length;
      const g = new THREE.Group();
      g.visible = false;
      g.renderOrder = 35;

      const v = idx % rockGeos.length;
      const rock = new THREE.Mesh(rockGeos[v], rockMatBase.clone());
      rock.renderOrder = 35;
      g.add(rock);

      const edges = new THREE.LineSegments(rockEdgeGeos[v], rockEdgeMatBase.clone());
      edges.renderOrder = 36;
      g.add(edges);

      const crystals = [];
      const crystalGlows = [];
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(crystalGeo, crystalMatBase.clone());
        c.visible = false;
        c.renderOrder = 37;
        g.add(c);
        crystals.push(c);

        const cg = new THREE.Mesh(crystalGeo, crystalGlowMatBase.clone());
        cg.visible = false;
        cg.renderOrder = 38;
        g.add(cg);
        crystalGlows.push(cg);
      }

      g.userData.rock = rock;
      g.userData.edges = edges;
      g.userData.crystals = crystals;
      g.userData.crystalGlows = crystalGlows;

      worldRoot.add(g);
      obstacleGroups.push(g);
    }

    for (let i = count; i < obstacleGroups.length; i++) {
      obstacleGroups[i].visible = false;
    }
  }

  // Enemies as individual meshes (pooled).
  // Reason: per-instance colors on InstancedMesh are unreliable on some devices/browsers,
  // which makes enemies appear gray/black dots. Pooled meshes keep performance OK and
  // guarantee per-enemy color/material updates.
  const enemyGeo = new THREE.SphereGeometry(1, 38, 28);
  const enemyBaseMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.08,
    metalness: 0.0,
    // Important: keep enemies opaque so black enemies don't disappear on a black background.
    transmission: 0.0,
    thickness: 0.0,
    ior: 1.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.55,
    attenuationColor: new THREE.Color(0xffffff),
    attenuationDistance: 6.5,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.06,
  });
  // Rim outline: subtle light border so enemies are always readable.
  const enemyGlowBaseMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xe6e6e6),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
  });

  // Inner core glow to sell depth/"jelly" volume.
  const enemyCoreGeo = new THREE.SphereGeometry(1, 18, 14);
  const enemyCoreBaseMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffffff),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const enemyMeshes = [];
  const enemyGlowMeshes = [];
  const enemyCoreMeshes = [];

  // Optional HUD "NEXT" enemy preview (separate tiny WebGL renderer).
  let nextPreviewCanvas = null;
  let nextPreviewRenderer = null;
  let nextPreviewScene = null;
  let nextPreviewCamera = null;
  let nextPreviewPivot = null;
  let nextPreviewRoot = null;
  let nextPreviewBody = null;
  let nextPreviewGlow = null;
  let nextPreviewCore = null;

  function setNextEnemyPreviewCanvas(canvasEl) {
    if (!canvasEl) return;
    if (nextPreviewCanvas === canvasEl) return;

    // Dispose previous renderer if the canvas changes.
    if (nextPreviewRenderer) {
      try {
        nextPreviewRenderer.dispose();
      } catch {
        // ignore
      }
    }

    nextPreviewCanvas = canvasEl;
    nextPreviewRenderer = null;
    nextPreviewScene = null;
    nextPreviewCamera = null;
    nextPreviewPivot = null;
    nextPreviewRoot = null;
    nextPreviewBody = null;
    nextPreviewGlow = null;
    nextPreviewCore = null;
  }

  function ensureNextEnemyPreview() {
    if (!nextPreviewCanvas) return;
    if (nextPreviewRenderer && nextPreviewScene && nextPreviewCamera) return;

    nextPreviewRenderer = new THREE.WebGLRenderer({
      canvas: nextPreviewCanvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    // Let the HUD background show through outside the circular mask.
    nextPreviewRenderer.setClearColor(0x000000, 0);
    nextPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    nextPreviewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    nextPreviewRenderer.toneMappingExposure = renderer.toneMappingExposure;

    nextPreviewScene = new THREE.Scene();
    nextPreviewScene.environment = envTex;

    // Match the main renderer's "tilt-world" approach.
    nextPreviewPivot = new THREE.Group();
    nextPreviewPivot.rotation.x = CAMERA_TILT;
    nextPreviewRoot = new THREE.Group();
    nextPreviewPivot.add(nextPreviewRoot);
    nextPreviewScene.add(nextPreviewPivot);

    // Camera is orthographic in pixel-ish units.
    nextPreviewCamera = new THREE.OrthographicCamera(-40, 40, 40, -40, -3000, 3000);
    nextPreviewCamera.position.set(0, 0, 900);
    nextPreviewCamera.lookAt(new THREE.Vector3(0, 0, 0));

    // Lighting: keep consistent with main scene so materials match.
    nextPreviewScene.add(new THREE.HemisphereLight(0x7de9ff, 0x170a2e, 0.9));
    nextPreviewScene.add(new THREE.AmbientLight(0xffffff, 0.20));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.2);
    d1.position.set(-350, -400, 900);
    nextPreviewScene.add(d1);
    const d2 = new THREE.DirectionalLight(0xff4bd8, 0.55);
    d2.position.set(400, 200, 600);
    nextPreviewScene.add(d2);
    const p = new THREE.PointLight(0xffffff, 1.15, 900, 2.0);
    p.position.set(140, 110, 260);
    nextPreviewScene.add(p);

    // Enemy meshes (single instance, same geo/material pipeline as in-game).
    const bodyMat = enemyBaseMat.clone();
    attachJellyWobble(bodyMat);
    nextPreviewBody = new THREE.Mesh(enemyGeo, bodyMat);
    nextPreviewBody.renderOrder = 50;
    nextPreviewRoot.add(nextPreviewBody);

    const glowMat = enemyGlowBaseMat.clone();
    attachJellyWobble(glowMat);
    nextPreviewGlow = new THREE.Mesh(enemyGeo, glowMat);
    nextPreviewGlow.renderOrder = 55;
    nextPreviewRoot.add(nextPreviewGlow);

    nextPreviewCore = new THREE.Mesh(enemyCoreGeo, enemyCoreBaseMat.clone());
    nextPreviewCore.renderOrder = 56;
    nextPreviewRoot.add(nextPreviewCore);
  }

  function renderNextEnemyPreview(nextEnemy, nowMs) {
    if (!nextPreviewCanvas) return;
    ensureNextEnemyPreview();
    if (!nextPreviewRenderer || !nextPreviewScene || !nextPreviewCamera) return;

    const canvas = nextPreviewCanvas;
    const dpr = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    const cssW = Math.max(16, canvas.clientWidth || 22);
    const cssH = Math.max(16, canvas.clientHeight || 22);

    nextPreviewRenderer.setPixelRatio(dpr);
    nextPreviewRenderer.setSize(cssW, cssH, false);
    nextPreviewCamera.left = -cssW / 2;
    nextPreviewCamera.right = cssW / 2;
    nextPreviewCamera.top = cssH / 2;
    nextPreviewCamera.bottom = -cssH / 2;
    nextPreviewCamera.updateProjectionMatrix();

    const e = nextEnemy;
    if (!e || !e.color) {
      nextPreviewBody.visible = false;
      nextPreviewGlow.visible = false;
      nextPreviewCore.visible = false;
      nextPreviewRenderer.render(nextPreviewScene, nextPreviewCamera);
      return;
    }

    const tNow = typeof nowMs === 'number' ? nowMs : performance.now();
    const vx = e.vx || 0;
    const vy = e.vy || 0;
    const v = Math.hypot(vx, vy);
    const squash = clamp(v * 0.5, 0, 0.22);
    const wob = 0.08 * Math.sin(tNow / 160 + (e.blobSeed || 0));

    // Scale enemy to fit the swatch nicely (independent of gameplay radius).
    const previewRadius = Math.min(cssW, cssH) * 0.34;
    const vis = 1.10;
    const sx = previewRadius * vis * (1 + squash);
    const sy = previewRadius * vis * (1 + squash);
    const sz = previewRadius * vis * (1 - squash) * (1 + wob);

    tmpColor.copy(colorToThree(e.color));
    const lum = tmpColor.r * 0.2126 + tmpColor.g * 0.7152 + tmpColor.b * 0.0722;
    const isVeryDark = lum < 0.12;

    nextPreviewBody.visible = true;
    nextPreviewGlow.visible = true;
    nextPreviewCore.visible = true;

    nextPreviewBody.position.set(0, 0, 20);
    nextPreviewGlow.position.set(0, 0, 20);
    nextPreviewCore.position.set(0, 0, 20);

    nextPreviewBody.scale.set(sx, sy, sz);
    nextPreviewGlow.scale.set(sx * 1.06, sy * 1.06, sz * 1.06);

    if (isVeryDark) {
      nextPreviewBody.material.color.setRGB(0.03, 0.03, 0.03);
      if (nextPreviewBody.material.attenuationColor) nextPreviewBody.material.attenuationColor.setRGB(0.03, 0.03, 0.03);
      nextPreviewBody.material.emissive.setRGB(0.06, 0.06, 0.06);
      nextPreviewBody.material.emissiveIntensity = 0.22;
    } else {
      nextPreviewBody.material.color.copy(tmpColor);
      if (nextPreviewBody.material.attenuationColor) nextPreviewBody.material.attenuationColor.copy(tmpColor);
      nextPreviewBody.material.emissive.copy(tmpColor);
      nextPreviewBody.material.emissiveIntensity = 0.08;
    }

    if (nextPreviewBody.material.userData && nextPreviewBody.material.userData.shader) {
      nextPreviewBody.material.userData.shader.uniforms.uTime.value = tNow;
      nextPreviewBody.material.userData.shader.uniforms.uSeed.value = (e.blobSeed || 0) + 0.37;
    }
    if (nextPreviewGlow.material.userData && nextPreviewGlow.material.userData.shader) {
      nextPreviewGlow.material.userData.shader.uniforms.uTime.value = tNow;
      nextPreviewGlow.material.userData.shader.uniforms.uSeed.value = (e.blobSeed || 0) + 0.37;
    }

    nextPreviewGlow.material.color.set(isVeryDark ? 0xf0f0f0 : 0xe0e0e0);
    nextPreviewGlow.material.opacity = isVeryDark ? 0.22 : 0.14;

    const pulse = 0.88 + 0.12 * Math.sin(tNow / 140 + (e.blobSeed || 0));
    nextPreviewCore.scale.set(sx * 0.62 * pulse, sy * 0.62 * pulse, sz * 0.62 * pulse);
    nextPreviewCore.material.color.copy(tmpColor);
    nextPreviewCore.material.opacity = 0.40;

    nextPreviewRenderer.render(nextPreviewScene, nextPreviewCamera);
  }

  function attachJellyWobble(material) {
    // Adds a cheap animated surface wobble while keeping real lighting from MeshPhysicalMaterial.
    // Uses per-material shader uniforms so each enemy can have its own phase/seed.
    material.userData.shader = null;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSeed = { value: 0 };
      material.userData.shader = shader;

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        'uniform float uTime;\nuniform float uSeed;\nvoid main() {'
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'float t = uTime * 0.001;',
          'float s = uSeed;',
          // 3-axis ripples + a slow "breathing" term.
          'float n = 0.0;',
          'n += sin((position.x * 5.1) + (t * 2.1) + (s * 1.3)) * 0.050;',
          'n += sin((position.y * 4.3) - (t * 1.7) + (s * 0.9)) * 0.045;',
          'n += sin((position.z * 6.2) + (t * 1.4) - (s * 1.1)) * 0.040;',
          'n += sin(t * 2.8 + s) * 0.020;',
          // Push along normal so it stays blob-like.
          'transformed += normal * n;',
        ].join('\n')
      );
    };

    // Force recompilation when applied.
    material.needsUpdate = true;
  }

  // Enemy fake shadows
  const shGeo = new THREE.CircleGeometry(1, 20);
  const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
  const shadowMesh = new THREE.InstancedMesh(shGeo, shMat, 64);
  shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  worldRoot.add(shadowMesh);

  // Bullets as instanced glowing spheres (unlit so they always pop)
  const bulletGeo = new THREE.SphereGeometry(1, 10, 8);
  const bulletMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x66ccff),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  bulletMat.depthTest = false;
  const bulletMesh = new THREE.InstancedMesh(bulletGeo, bulletMat, 256);
  bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bulletMesh.renderOrder = 80;
  worldRoot.add(bulletMesh);

  // Outer plasma bloom (soft larger sphere)
  const bulletOuterMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x66ccff),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  bulletOuterMat.depthTest = false;
  const bulletOuterMesh = new THREE.InstancedMesh(bulletGeo, bulletOuterMat, 256);
  bulletOuterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bulletOuterMesh.renderOrder = 78;
  worldRoot.add(bulletOuterMesh);

  // Plasma trail (flat quad aligned to velocity)
  const trailGeo = new THREE.PlaneGeometry(1, 1);
  const trailMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x66ccff),
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const bulletTrail = new THREE.InstancedMesh(trailGeo, trailMat, 256);
  bulletTrail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bulletTrail.renderOrder = 77;
  worldRoot.add(bulletTrail);

  // Bullet halo (flat circle)
  const haloGeo = new THREE.CircleGeometry(1, 18);
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x66ccff),
    transparent: true,
    opacity: 0.30,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  haloMat.depthTest = false;
  const bulletHalo = new THREE.InstancedMesh(haloGeo, haloMat, 256);
  bulletHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bulletHalo.renderOrder = 79;
  worldRoot.add(bulletHalo);

  // Powerups as pooled meshes.
  // Reason: instanced per-instance colors can be unreliable on some devices (same issue as enemies).
  const pupGeo = new THREE.SphereGeometry(1, 18, 14);
  const pupMatBase = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.22,
    metalness: 0.05,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.85,
  });
  const pupGlowBase = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffffff),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
  });

  const powerMeshes = [];
  const powerGlowMeshes = [];

  // Player hero rig: crystal space capsule + thrusters + plasma cannon (distinct from jelly enemies)
  const playerGroup = new THREE.Group();
  playerGroup.renderOrder = 60;
  worldRoot.add(playerGroup);

  // --- Crystal capsule ---
  const capsuleGroup = new THREE.Group();
  capsuleGroup.renderOrder = 61;
  playerGroup.add(capsuleGroup);

  const capsuleCrystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.045,
    metalness: 0.0,
    transmission: 0.80,
    thickness: 1.05,
    ior: 1.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.25,
    attenuationColor: new THREE.Color(0xffffff),
    attenuationDistance: 7.5,
  });
  const capsuleInnerGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffffff),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const capsuleEdgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xf2f2f2),
    transparent: true,
    opacity: 0.22,
  });

  // Faceted capsule pieces in unit space (scaled by player.radius later)
  const capSides = 7;
  const bodyGeo = new THREE.CylinderGeometry(0.88, 0.88, 2.05, capSides, 1, false);
  bodyGeo.rotateX(Math.PI / 2);
  const noseGeo = new THREE.ConeGeometry(0.88, 0.75, capSides, 1, false);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.rotateZ(Math.PI);
  const tailGeo = new THREE.ConeGeometry(0.88, 0.75, capSides, 1, false);
  tailGeo.rotateX(Math.PI / 2);

  const capsuleBody = new THREE.Mesh(bodyGeo, capsuleCrystalMat);
  capsuleBody.position.set(0, 0, 0.88);
  capsuleBody.renderOrder = 61;
  capsuleGroup.add(capsuleBody);

  const capsuleNose = new THREE.Mesh(noseGeo, capsuleCrystalMat);
  capsuleNose.position.set(0.00, 0.00, 1.98);
  capsuleNose.renderOrder = 61;
  capsuleGroup.add(capsuleNose);

  const capsuleTail = new THREE.Mesh(tailGeo, capsuleCrystalMat);
  capsuleTail.position.set(0.00, 0.00, -0.22);
  capsuleTail.renderOrder = 61;
  capsuleGroup.add(capsuleTail);

  const innerGeo = new THREE.IcosahedronGeometry(0.66, 0);
  const capsuleInner = new THREE.Mesh(innerGeo, capsuleInnerGlowMat);
  capsuleInner.position.set(0.0, 0.0, 0.90);
  capsuleInner.renderOrder = 62;
  capsuleGroup.add(capsuleInner);

  const capsuleEdges = new THREE.Group();
  capsuleEdges.renderOrder = 63;
  capsuleGroup.add(capsuleEdges);
  const eBody = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo, 12), capsuleEdgeMat);
  const eNose = new THREE.LineSegments(new THREE.EdgesGeometry(noseGeo, 12), capsuleEdgeMat);
  const eTail = new THREE.LineSegments(new THREE.EdgesGeometry(tailGeo, 12), capsuleEdgeMat);
  eBody.position.copy(capsuleBody.position);
  eNose.position.copy(capsuleNose.position);
  eTail.position.copy(capsuleTail.position);
  capsuleEdges.add(eBody);
  capsuleEdges.add(eNose);
  capsuleEdges.add(eTail);

  // Glowing mid-band to make the capsule read better top-down.
  const capsuleBandGeo = new THREE.TorusGeometry(0.92, 0.08, 10, 40);
  const capsuleBandMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.25,
    metalness: 0.15,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.85,
  });
  const capsuleBand = new THREE.Mesh(capsuleBandGeo, capsuleBandMat);
  capsuleBand.renderOrder = 62;
  capsuleBand.position.set(0, 0, 0.82);
  capsuleBand.rotation.x = Math.PI / 2;
  capsuleGroup.add(capsuleBand);

  // --- Thrusters (4 small RCS jets) ---
  const thrusterGroup = new THREE.Group();
  thrusterGroup.renderOrder = 64;
  playerGroup.add(thrusterGroup);

  const thrusterNozzleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x4b5563),
    roughness: 0.45,
    metalness: 0.55,
    emissive: new THREE.Color(0x0a0c10),
    emissiveIntensity: 0.35,
  });
  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x66ccff),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const nozzleGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.30, 12);
  nozzleGeo.rotateX(Math.PI / 2);

  // Flame geometry: move cone so its base starts at the origin.
  // This makes it easy to place the flame exactly at the nozzle opening.
  const FLAME_R = 0.18;
  const FLAME_H = 0.70;
  const flameGeo = new THREE.ConeGeometry(FLAME_R, FLAME_H, 12);
  flameGeo.translate(0, FLAME_H * 0.5, 0);

  function makeThruster(dirX, dirY) {
    const g = new THREE.Group();
    g.userData.dir = { x: dirX, y: dirY };
    // Place nozzle on that side.
    const off = 1.22;
    g.position.set(dirX * off, dirY * off, 0.68);

    const nozzle = new THREE.Mesh(nozzleGeo, thrusterNozzleMat);
    nozzle.renderOrder = 64;
    // Small offset so the nozzle reads as an attached side-jet.
    nozzle.position.set(dirX * 0.10, dirY * 0.10, 0.08);
    g.add(nozzle);

    const flame = new THREE.Mesh(flameGeo, flameMat.clone());
    flame.renderOrder = 65;
    flame.visible = false;
    // Default cone points +Y, rotate to match dir.
    const ang = Math.atan2(dirY, dirX);
    flame.rotation.z = ang - Math.PI / 2;
    // Place flame base exactly at the nozzle opening.
    const nozzleTip = new THREE.Vector3(dirX * 0.16, dirY * 0.16, 0.08);
    flame.position.copy(nozzleTip);
    g.userData.nozzleTip = nozzleTip;
    flame.scale.setScalar(0.62);
    g.add(flame);
    g.userData.flame = flame;
    thrusterGroup.add(g);
    return g;
  }

  const thrusters = [
    makeThruster(-1, 0),
    makeThruster(1, 0),
    makeThruster(0, -1),
    makeThruster(0, 1),
  ];

  // Plasma cannon (points toward aimAngle)
  const playerAimGroup = new THREE.Group();
  playerAimGroup.renderOrder = 65;
  playerGroup.add(playerAimGroup);

  // Cannon uses a different shiny crystal-tech material so it stands out from the capsule.
  const cannonCrystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    roughness: 0.10,
    metalness: 0.0,
    transmission: 0.45,
    thickness: 0.35,
    ior: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.35,
    attenuationColor: new THREE.Color(0x66ccff),
    attenuationDistance: 4.5,
    emissive: new THREE.Color(0x0b1a22),
    emissiveIntensity: 0.35,
  });
  const cannonGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x66ccff),
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const cannonBaseGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.40, 14);
  cannonBaseGeo.rotateZ(-Math.PI / 2);
  const cannonBarrelGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.56, 14);
  cannonBarrelGeo.rotateZ(-Math.PI / 2);
  const cannon = new THREE.Group();
  cannon.renderOrder = 66;
  cannon.position.set(0.90, 0, 0.84);
  playerAimGroup.add(cannon);

  const cannonBase = new THREE.Mesh(cannonBaseGeo, cannonCrystalMat);
  cannonBase.renderOrder = 66;
  cannon.add(cannonBase);

  const cannonBarrel = new THREE.Mesh(cannonBarrelGeo, cannonCrystalMat);
  cannonBarrel.renderOrder = 66;
  cannonBarrel.position.set(0.38, 0, 0);
  cannon.add(cannonBarrel);

  const muzzleGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const muzzleGlow = new THREE.Mesh(muzzleGeo, cannonGlowMat);
  muzzleGlow.renderOrder = 67;
  muzzleGlow.position.set(0.68, 0, 0);
  cannon.add(muzzleGlow);
  // Tiny extra plasma bloom
  const muzzleBloomGeo = new THREE.CircleGeometry(0.28, 18);
  const muzzleBloomMat = cannonGlowMat.clone();
  muzzleBloomMat.opacity = 0.22;
  const muzzleBloom = new THREE.Mesh(muzzleBloomGeo, muzzleBloomMat);
  muzzleBloom.renderOrder = 67;
  muzzleBloom.position.set(0.68, 0, 0);
  cannon.add(muzzleBloom);

  const tmpObj = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const tmpV3 = new THREE.Vector3();

  // Per-bullet visual state (render-only). WeakMap so old bullets GC naturally.
  const bulletVisual = new WeakMap();

  // For thruster visuals: estimate player movement per-frame.
  let lastPlayerX = null;
  let lastPlayerY = null;
  let lastPlayerT = null;

  function ensureEnemyPool(count) {
    while (enemyMeshes.length < count) {
      const bodyMat = enemyBaseMat.clone();
      attachJellyWobble(bodyMat);
      const m = new THREE.Mesh(enemyGeo, bodyMat);
      m.visible = false;
      m.renderOrder = 50;
      worldRoot.add(m);
      enemyMeshes.push(m);

      const glowMat = enemyGlowBaseMat.clone();
      attachJellyWobble(glowMat);
      const g = new THREE.Mesh(enemyGeo, glowMat);
      g.visible = false;
      g.renderOrder = 55;
      worldRoot.add(g);
      enemyGlowMeshes.push(g);

      const c = new THREE.Mesh(enemyCoreGeo, enemyCoreBaseMat.clone());
      c.visible = false;
      c.renderOrder = 56;
      worldRoot.add(c);
      enemyCoreMeshes.push(c);
    }

    for (let i = count; i < enemyMeshes.length; i++) {
      enemyMeshes[i].visible = false;
      enemyGlowMeshes[i].visible = false;
      enemyCoreMeshes[i].visible = false;
    }
  }

  function ensurePowerPool(count) {
    while (powerMeshes.length < count) {
      const m = new THREE.Mesh(pupGeo, pupMatBase.clone());
      m.visible = false;
      m.renderOrder = 72;
      worldRoot.add(m);
      powerMeshes.push(m);

      const g = new THREE.Mesh(pupGeo, pupGlowBase.clone());
      g.visible = false;
      g.renderOrder = 73;
      worldRoot.add(g);
      powerGlowMeshes.push(g);
    }

    for (let i = count; i < powerMeshes.length; i++) {
      powerMeshes[i].visible = false;
      powerGlowMeshes[i].visible = false;
    }
  }

  function setSize(w, h, dpr) {
    const safeDpr = clamp(dpr || 1, 1, 2);
    renderer.setPixelRatio(safeDpr);
    renderer.setSize(w, h, false);

    viewW = w;
    viewH = h;

    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();

    ground.geometry.dispose();
    // Slightly oversized so tilted camera doesn't reveal edges.
    ground.geometry = new THREE.PlaneGeometry(w * 1.55, h * 1.55);
    ground.position.set(0, 0, 0);

    // Keep tilt pivot at origin to avoid drift.
    worldPivot.position.set(0, 0, 0);
    worldRoot.position.set(0, 0, 0);

    // Camera stays centered at origin.
    camera.position.set(0, 0, 900);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
  }

  function render(state) {
    if (!state) return;
    const { cam, map, world, player, aimAngle, enemies, bullets, powerUps, obstacles, nowMs, bulletRadius, bulletSpeed, nextEnemyPreview } = state;

    const tNow = nowMs || performance.now();

    const cx = cam?.x || 0;
    const cy = cam?.y || 0;
    const halfW = viewW * 0.5;
    const halfH = viewH * 0.5;
    const toVX = (x) => (x - cx) - halfW;
    const toVY = (y) => halfH - (y - cy);

    // Background planets (parallax)
    if (!planetsReady && map && typeof map.w === 'number' && typeof map.h === 'number') {
      initPlanets(map.w, map.h);
    }
    for (const p of planets) {
      // Map-anchored planet positions, rendered with a gentle parallax.
      const vx = toVX(p.x);
      const vy = toVY(p.y);
      p.mesh.position.set(vx, vy, p.mesh.position.z);
      p.mesh.scale.setScalar(p.r * 2);
      p.glow.position.set(vx, vy, p.glow.position.z);
      p.glow.scale.setScalar(p.r * 2.35);
    }

    // Background is static black; no texture scrolling.

    // Keep highlights stable (avoid motion sickness).
    glint.position.set(toVX(player.x) + 140, toVY(player.y) + 110, 260);

    // Player
    const pCol = colorToThree(player.color || 'magenta');
    const pX = toVX(player.x);
    const pY = toVY(player.y);
    const bob = 0.35 * Math.sin(tNow / 170);
    playerGroup.position.set(pX, pY, 24 + bob);
    playerGroup.scale.setScalar(player.radius * 1.25);

    // Crystal capsule: tint via attenuation + inner glow.
    capsuleCrystalMat.attenuationColor.copy(pCol);
    capsuleInnerGlowMat.color.copy(pCol);
    capsuleBandMat.color.copy(pCol);
    capsuleBandMat.emissive.copy(pCol);
    // Slight internal spin for life (not dizzy)
    capsuleInner.rotation.z = tNow / 900;

    // Thrusters: show exhaust opposite movement direction.
    // Prefer true velocity if available; otherwise estimate from delta position.
    let pvx = typeof player.vx === 'number' ? player.vx : 0;
    let pvy = typeof player.vy === 'number' ? player.vy : 0;
    if ((pvx === 0 && pvy === 0) && lastPlayerX != null && lastPlayerY != null && lastPlayerT != null) {
      const dt = clamp((tNow - lastPlayerT) / 1000, 0.001, 0.05);
      pvx = (player.x - lastPlayerX) / dt;
      pvy = (player.y - lastPlayerY) / dt;
    }
    lastPlayerX = player.x;
    lastPlayerY = player.y;
    lastPlayerT = tNow;

    // Convert to view-space direction (y is flipped in renderer).
    const vvx = pvx;
    const vvy = -pvy;
    const sp = Math.hypot(vvx, vvy);
    const hasMove = sp > 6;
    const ex = hasMove ? -vvx / sp : 0;
    const ey = hasMove ? -vvy / sp : 0;
    const thrust = clamp(sp / 240, 0, 1);
    for (const t of thrusters) {
      const d = t.userData.dir;
      const flame = t.userData.flame;
      const dot = ex * d.x + ey * d.y;
      const inten = clamp(dot, 0, 1) * thrust;
      flame.visible = inten > 0.006;
      if (!flame.visible) {
        flame.material.opacity = 0.0;
        continue;
      }
      // Thruster flame color leans warm-white + player tint.
      flame.material.color.copy(pCol).lerp(new THREE.Color(0xffffff), 0.55);
      flame.material.opacity = 0.08 + inten * 0.42;
      flame.scale.setScalar(0.55 + inten * 0.75);
    }

    // Aim pointer
    const a = typeof aimAngle === 'number' ? aimAngle : 0;
    // Game logic uses screen-style coords (y down => positive angles feel clockwise).
    // Renderer view space is y up, so negate to match shooting direction.
    playerAimGroup.rotation.z = -a;
    // Cannon stays a different hue: icy cyan that doesn't match the capsule.
    cannonCrystalMat.attenuationColor.set(0x66ccff);
    cannonCrystalMat.emissive.set(0x123244);
    muzzleGlow.material.color.set(0x66ccff);
    muzzleBloom.material.color.set(0x66ccff);

    // Update matrices before reading muzzle transform.
    playerGroup.updateMatrixWorld(true);

    // Cannon muzzle position in worldRoot-local (view) coordinates.
    muzzleGlow.getWorldPosition(tmpV3);
    worldRoot.worldToLocal(tmpV3);
    const muzzleVX = tmpV3.x;
    const muzzleVY = tmpV3.y;
    const muzzleVZ = tmpV3.z;

    // Bullets are rendered at a fixed local Z, but the cannon muzzle sits higher.
    // With the world tilt, Z affects screen-Y, so we project the muzzle onto the
    // bullet Z-plane for spawn alignment (prevents "above the tip" on left/right aim).
    const BULLET_Z_CORE = 14;
    const muzzleVYForBullets = muzzleVY + (BULLET_Z_CORE - muzzleVZ) * Math.tan(CAMERA_TILT);

    // Convert muzzle view coords back to gameplay world coords.
    const muzzleWX = muzzleVX + cx + halfW;
    const muzzleWY = cy + halfH - muzzleVYForBullets;

    // Update player-following key light so building faces shift as you move.
    playerKeyTarget.position.set(pX, pY, 0);
    playerKey.position.set(pX + 220, pY - 260, 520);
    playerKeyTarget.updateMatrixWorld();
    playerKey.updateMatrixWorld();

    // Obstacles -> asteroids + crystals
    const obs = obstacles || [];
    ensureAsteroidPool(obs.length);
    for (let i = 0; i < obs.length; i++) {
      const r = obs[i];
      const ow = Math.max(1, r.w);
      const oh = Math.max(1, r.h);
      const kind = r.kind || 'wall';

      // Keep visuals clean: hide map boundary colliders.
      if (kind === 'border') {
        obstacleGroups[i].visible = false;
        continue;
      }

      const baseH = kind === 'border' || kind === 'wall' ? 46 : kind === 'car' ? 26 : 22;
      const height = baseH + Math.min(ow, oh) * 0.18;
      const ox = r.x + ow / 2;
      const oy = r.y + oh / 2;

      const g = obstacleGroups[i];
      g.visible = true;
      g.position.set(toVX(ox), toVY(oy), height * 0.45);

      // Render obstacles as asteroids (avoid long stretched shapes).
      const sxy = Math.min(ow, oh) * 0.55;
      const sz = height * 0.55;
      g.scale.set(sxy, sxy, sz);

      const seed = seeded01((ox * 0.013 + oy * 0.017 + i * 0.11) * 100.0);
      g.rotation.set(0, 0, (seed - 0.5) * 2.4);
      g.userData.rock.rotation.set((seed - 0.5) * 0.8, (seeded01(seed + 2.2) - 0.5) * 0.8, 0);

      // Rock material variation
      const rockHue = 210 + 30 * seeded01(seed + 9.1);
      const rockLight = 18 + 10 * seeded01(seed + 9.9);
      g.userData.rock.material.color.setHSL(rockHue / 360, 0.18, rockLight / 100);

      // Subtle edge glow tint
      const edge = g.userData.edges;
      edge.material.opacity = 0.14 + 0.10 * seeded01(seed + 4.4);
      edge.material.color.setHSL((rockHue + 40) / 360, 0.75, 0.70);

      // Crystals on some asteroids
      const crystals = g.userData.crystals;
      const glows = g.userData.crystalGlows;
      const crystalChance = seeded01(seed + 6.6);
      const crystalCount = crystalChance > 0.72 ? 3 : crystalChance > 0.58 ? 2 : crystalChance > 0.48 ? 1 : 0;
      const crystalHue =
        kind === 'kiosk'
          ? 190
          : kind === 'car'
            ? 315
            : kind === 'dumpster'
              ? 120
              : kind === 'barrier'
                ? 35
                : 205;

      for (let k = 0; k < crystals.length; k++) {
        const on = k < crystalCount;
        const c = crystals[k];
        const cg = glows[k];
        c.visible = on;
        cg.visible = on;
        if (!on) continue;

        const a = seeded01(seed + 10.0 + k * 1.7) * Math.PI * 2;
        const rr = 0.55 + 0.25 * seeded01(seed + 11.0 + k * 1.3);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        const pz = 0.80 + 0.25 * seeded01(seed + 12.0 + k * 1.9);

        c.position.set(px, py, pz);
        c.rotation.set(-0.4, 0, a);
        const cs = 0.35 + 0.35 * seeded01(seed + 13.0 + k * 2.1);
        c.scale.set(cs, cs, cs);

        c.material.color.setHSL(crystalHue / 360, 0.95, 0.70);
        c.material.emissive.setHSL(crystalHue / 360, 0.95, 0.62);
        c.material.emissiveIntensity = 0.25 + 0.25 * seeded01(seed + 14.0 + k * 1.1);

        cg.position.copy(c.position);
        cg.rotation.copy(c.rotation);
        cg.scale.set(cs * 1.25, cs * 1.25, cs * 1.25);
        cg.material.color.setHSL(crystalHue / 360, 0.95, 0.72);
        cg.material.opacity = 0.18;
      }
    }

    // No random background decorations: keep it clean.

    // Enemies (wobble their scale a bit for 3D jelly feel)
    const es = enemies || [];
    const enemyCount = Math.min(es.length, 64);
    ensureEnemyPool(enemyCount);

    const targetEnemyColor = nextEnemyPreview?.color || null;

    for (let i = 0; i < enemyCount; i++) {
      const e = es[i];
      const vx = e.vx || 0;
      const vy = e.vy || 0;
      const v = Math.hypot(vx, vy);
      const squash = clamp(v * 0.5, 0, 0.22);
      const wob = 0.08 * Math.sin(tNow / 160 + (e.blobSeed || 0));

      const ex = toVX(e.x);
      const ey = toVY(e.y);
      // Keep visuals close to collision radius so enemies don't visually overlap.
      const vis = 1.10;
      const sx = e.radius * vis * (1 + squash);
      const sy = e.radius * vis * (1 + squash);
      const sz = e.radius * vis * (1 - squash) * (1 + wob);

      const isTargetEnemy = !!targetEnemyColor && e.color === targetEnemyColor;

      tmpColor.copy(colorToThree(e.color));
      const lum = tmpColor.r * 0.2126 + tmpColor.g * 0.7152 + tmpColor.b * 0.0722;
      const isVeryDark = lum < 0.12;

      const m = enemyMeshes[i];
      m.visible = true;
      m.position.set(ex, ey, 20);
      m.scale.set(sx, sy, sz);
      if (isVeryDark) {
        // Keep it black, but not invisible.
        m.material.color.setRGB(0.03, 0.03, 0.03);
        if (m.material.attenuationColor) m.material.attenuationColor.setRGB(0.03, 0.03, 0.03);
        m.material.emissive.setRGB(0.06, 0.06, 0.06);
        m.material.emissiveIntensity = 0.22;
      } else {
        m.material.color.copy(tmpColor);
        if (m.material.attenuationColor) m.material.attenuationColor.copy(tmpColor);
        m.material.emissive.copy(tmpColor);
        m.material.emissiveIntensity = 0.08;
      }
      if (m.material.userData && m.material.userData.shader) {
        m.material.userData.shader.uniforms.uTime.value = tNow;
        m.material.userData.shader.uniforms.uSeed.value = (e.blobSeed || 0) + i * 0.37;
      }

      const g = enemyGlowMeshes[i];
      g.visible = true;
      g.position.set(ex, ey, 20);
      // Thin outline (tiny) so even black enemies read on black.
      const pulse01 = 0.5 + 0.5 * Math.sin(tNow / 200 + (e.blobSeed || 0) * 0.7);
      const glowScale = isTargetEnemy ? (1.10 + 0.02 * pulse01) : 1.06;
      g.scale.set(sx * glowScale, sy * glowScale, sz * glowScale);

      // Keep this extremely simple for perf: just pulse outline opacity for target.
      // No blending/depthTest switches (those can cause hitches on some GPUs).
      g.material.color.set(isVeryDark ? 0xf0f0f0 : 0xe0e0e0);
      g.material.opacity = (isVeryDark ? 0.22 : 0.14) + (isTargetEnemy ? (0.10 + 0.08 * pulse01) : 0);
      if (g.material.userData && g.material.userData.shader) {
        g.material.userData.shader.uniforms.uTime.value = tNow;
        g.material.userData.shader.uniforms.uSeed.value = (e.blobSeed || 0) + i * 0.37;
      }

      const c = enemyCoreMeshes[i];
      c.visible = true;
      c.position.set(ex, ey, 20);
      const pulse = 0.88 + 0.12 * Math.sin(tNow / 140 + (e.blobSeed || 0));
      c.scale.set(sx * 0.62 * pulse, sy * 0.62 * pulse, sz * 0.62 * pulse);
      c.material.color.copy(tmpColor);
      c.material.opacity = 0.40;

      // shadow
      tmpObj.position.set(ex, ey, 0.9);
      tmpObj.rotation.set(Math.PI, 0, 0);
      tmpObj.scale.set(e.radius * 1.35, e.radius * 1.05, 1);
      tmpObj.updateMatrix();
      shadowMesh.setMatrixAt(i, tmpObj.matrix);
    }
    shadowMesh.count = enemyCount;
    shadowMesh.instanceMatrix.needsUpdate = true;

    // Bullets (plasma bolt + bloom + halo + trail)
    const bs = bullets || [];
    const br = typeof bulletRadius === 'number' ? bulletRadius : 3;
    const bSpeed = typeof bulletSpeed === 'number' ? bulletSpeed : 5;
    for (let i = 0; i < bs.length && i < 256; i++) {
      const b = bs[i];
      // Render-only: smooth muzzle-origin without snapping when the player moves.
      // We cache a per-bullet offset at spawn time and fade it out over a short distance.
      let meta = bulletVisual.get(b);
      if (!meta) {
        const bvx = typeof b.vx === 'number' ? b.vx : 0;
        const bvy = typeof b.vy === 'number' ? b.vy : 0;
        const spw = Math.hypot(bvx, bvy);
        const nxw = spw > 0.001 ? bvx / spw : Math.cos(a);
        const nyw = spw > 0.001 ? bvy / spw : Math.sin(a);

        // Estimate where the bullet spawned (one tick back) so the fade starts stable.
        const spawnX = b.x - nxw * bSpeed;
        const spawnY = b.y - nyw * bSpeed;

        // Offset from player center to muzzle at the time we first see this bullet.
        let offX = muzzleWX - player.x;
        let offY = muzzleWY - player.y;
        // Critical: remove any sideways component so the bolt stays centered on the barrel axis.
        // (Sideways shift is most visible when aiming left/right.)
        const offDot = offX * nxw + offY * nyw;
        offX = nxw * offDot;
        offY = nyw * offDot;

        const offLen = Math.hypot(offX, offY);

        meta = {
          spawnX,
          spawnY,
          nxw,
          nyw,
          offX,
          offY,
          fadeDist: Math.max(10, offLen * 1.15 + bSpeed * 1.25),
        };
        bulletVisual.set(b, meta);
      }

      const dxs = b.x - meta.spawnX;
      const dys = b.y - meta.spawnY;
      const traveled = clamp(dxs * meta.nxw + dys * meta.nyw, 0, meta.fadeDist);
      const fade = meta.fadeDist > 1e-6 ? traveled / meta.fadeDist : 1;

      const wx = b.x + meta.offX * (1 - fade);
      const wy = b.y + meta.offY * (1 - fade);
      const bx = toVX(wx);
      const by = toVY(wy);
      const seed = typeof b.seed === 'number' ? b.seed : 0;
      const pulse = 0.88 + 0.12 * Math.sin(tNow / 120 + seed);

      // Core bolt
      tmpObj.position.set(bx, by, 14);
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.scale.setScalar(br);
      tmpObj.updateMatrix();
      bulletMesh.setMatrixAt(i, tmpObj.matrix);

      // Outer bloom
      tmpObj.position.set(bx, by, 14);
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.scale.setScalar(br * (2.0 + 0.25 * pulse));
      tmpObj.updateMatrix();
      bulletOuterMesh.setMatrixAt(i, tmpObj.matrix);

      // Halo on ground
      tmpObj.position.set(bx, by, 2);
      tmpObj.rotation.set(Math.PI, 0, 0);
      tmpObj.scale.setScalar(br * (2.5 + 0.35 * pulse));
      tmpObj.updateMatrix();
      bulletHalo.setMatrixAt(i, tmpObj.matrix);

      // Trail aligned to velocity (convert to view-space by flipping y)
      const vvx = typeof b.vx === 'number' ? b.vx : 0;
      const vvy = -(typeof b.vy === 'number' ? b.vy : 0);
      const sp = Math.hypot(vvx, vvy);
      const hasVel = sp > 0.001;
      const nx = hasVel ? vvx / sp : 1;
      const ny = hasVel ? vvy / sp : 0;
      const ang = Math.atan2(ny, nx);

      const back = br * 1.35;
      tmpObj.position.set(bx - nx * back, by - ny * back, 11);
      tmpObj.rotation.set(0, 0, ang);
      const trailLen = br * (2.2 + clamp(sp * 0.045, 0.0, 2.4));
      const trailWid = br * 0.95;
      tmpObj.scale.set(trailWid, trailLen, 1);
      tmpObj.updateMatrix();
      bulletTrail.setMatrixAt(i, tmpObj.matrix);
    }
    const bulletCount = Math.min(bs.length, 256);
    bulletMesh.count = bulletCount;
    bulletOuterMesh.count = bulletCount;
    bulletHalo.count = bulletCount;
    bulletTrail.count = bulletCount;
    bulletMesh.instanceMatrix.needsUpdate = true;
    bulletOuterMesh.instanceMatrix.needsUpdate = true;
    bulletHalo.instanceMatrix.needsUpdate = true;
    bulletTrail.instanceMatrix.needsUpdate = true;

    // Powerups
    const ps = powerUps || [];
    const pc = Math.min(ps.length, 64);
    ensurePowerPool(pc);
    for (let i = 0; i < pc; i++) {
      const p = ps[i];
      tmpColor.copy(colorToThree(p.color || 'cyan'));

      const m = powerMeshes[i];
      m.visible = true;
      m.position.set(toVX(p.x), toVY(p.y), 16);
      m.scale.setScalar(p.radius * 1.15);
      m.material.color.copy(tmpColor);
      m.material.emissive.copy(tmpColor);

      const g = powerGlowMeshes[i];
      g.visible = true;
      g.position.set(toVX(p.x), toVY(p.y), 16);
      g.scale.setScalar(p.radius * 1.55);
      g.material.color.copy(tmpColor);
      g.material.opacity = 0.45;
    }

    renderer.render(scene, camera);

    // HUD NEXT enemy preview (rendered into its own canvas).
    renderNextEnemyPreview(nextEnemyPreview, tNow);
  }

  return {
    setSize,
    render,
    setNextEnemyPreviewCanvas,
  };
}
