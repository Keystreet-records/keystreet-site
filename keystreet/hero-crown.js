const THREE_CDN_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
  'https://unpkg.com/three@0.170.0/build/three.module.js',
  'https://cdn.skypack.dev/three@0.170.0'
];

const ROOM_ENV_CDN_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js',
  'https://unpkg.com/three@0.170.0/examples/jsm/environments/RoomEnvironment.js'
];

async function loadThree() {
  let lastErr = null;
  for (const url of THREE_CDN_CANDIDATES) {
    try {
      // @vite-ignore
      const mod = await import(url);
      if (mod && (mod.WebGLRenderer || mod.default?.WebGLRenderer)) return mod.default ?? mod;
      return mod;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Failed to load Three.js');
}

async function loadRoomEnvironment() {
  let lastErr = null;
  for (const url of ROOM_ENV_CDN_CANDIDATES) {
    try {
      // @vite-ignore
      return await import(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Failed to load RoomEnvironment');
}

async function createEnvironmentMap(THREE, renderer) {
  const { RoomEnvironment } = await loadRoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.03).texture;
  pmrem.dispose();
  room.dispose?.();
  return envMap;
}

function createPlasticMaterial(THREE, envMap) {
  return new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMap: envMap ?? null,
    envMapIntensity: envMap ? 0.32 : 0,
    reflectivity: 0.38
  });
}

function createWreathBranchCurveClass(THREE) {
  /** Flat circular wreath branch — 3 vines braided around a ring in the XZ plane */
  return class WreathBranchCurve extends THREE.Curve {
    constructor(branchIndex, branchCount = 3, radius = 1.05) {
      super();
      this.branchIndex = branchIndex;
      this.branchCount = branchCount;
      this.radius = radius;
      this.phase = (branchIndex / branchCount) * Math.PI * 2;
    }

    getPoint(t, optionalTarget = new THREE.Vector3()) {
      const angle = t * Math.PI * 2;
      const a = angle + this.phase * 0.12;

      const weave = Math.sin(angle * 3 + this.phase * 1.7) * 0.1;
      const r = this.radius + weave + (this.branchIndex - 1) * 0.018;

      const y =
        Math.sin(angle * 4 + this.phase * 2.1) * 0.04 +
        Math.cos(angle * 2 + this.phase) * 0.028;

      return optionalTarget.set(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  };
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickRandomTs(branchIndex, count, minGap) {
  const rng = seededRandom(42000 + branchIndex * 1337);
  const ts = [];
  let guard = 0;
  while (ts.length < count && guard < count * 40) {
    guard += 1;
    const t = 0.06 + rng() * 0.88;
    if (ts.every((v) => Math.abs(v - t) >= minGap)) ts.push(t);
  }
  return ts.sort((a, b) => a - b);
}

function placeThornsOnBranch(THREE, branchGroup, curve, branchIndex, material, options) {
  const { thornsPerBranch, lowDetail, tubeRadius } = options;
  const segs = lowDetail ? 6 : 8;
  const tangent = new THREE.Vector3();
  const ts = pickRandomTs(branchIndex, thornsPerBranch, 0.08);
  const pos = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const growDir = new THREE.Vector3();
  const attach = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const rng = seededRandom(9000 + branchIndex * 97);

  for (let i = 0; i < ts.length; i++) {
    curve.getPoint(ts[i], pos);
    curve.getTangent(ts[i], tangent).normalize();

    radial.set(pos.x, 0, pos.z);
    if (radial.lengthSq() < 1e-6) radial.set(1, 0, 0);
    radial.normalize();

    const sideSign = rng() > 0.5 ? 1 : -1;
    growDir
      .copy(radial).multiplyScalar(0.86 + rng() * 0.1)
      .addScaledVector(tangent, sideSign * (0.12 + rng() * 0.22))
      .addScaledVector(up, 0.04 + rng() * 0.06)
      .normalize();

    const len = 0.22 + rng() * 0.28;
    const thorn = createThorn(THREE, len, tubeRadius, material, segs);

    attach.copy(pos).addScaledVector(growDir, tubeRadius * 0.98);
    thorn.position.copy(attach).addScaledVector(growDir, -tubeRadius * 0.2);
    quat.setFromUnitVectors(up, growDir);
    thorn.quaternion.copy(quat);
    branchGroup.add(thorn);
  }
}

function createThorn(THREE, length, tubeRadius, material, segs) {
  const base = tubeRadius;
  const profile = [
    new THREE.Vector2(base, 0),
    new THREE.Vector2(base * 0.995, length * 0.015),
    new THREE.Vector2(base * 0.94, length * 0.05),
    new THREE.Vector2(base * 0.72, length * 0.22),
    new THREE.Vector2(base * 0.36, length * 0.58),
    new THREE.Vector2(0.001, length)
  ];
  const geo = new THREE.LatheGeometry(profile, segs);
  return new THREE.Mesh(geo, material);
}

export function buildCrownOfThorns(THREE, envMap, lowDetail) {
  const crown = new THREE.Group();
  const material = createPlasticMaterial(THREE, envMap);
  const WreathBranchCurve = createWreathBranchCurveClass(THREE);
  const tubular = lowDetail ? 120 : 200;
  const radial = lowDetail ? 8 : 14;
  const tube = 0.052;

  for (let b = 0; b < 3; b++) {
    const curve = new WreathBranchCurve(b);
    const branchGroup = new THREE.Group();
    const branch = new THREE.Mesh(
      new THREE.TubeGeometry(curve, tubular, tube, radial, true),
      material
    );
    branchGroup.add(branch);
    placeThornsOnBranch(THREE, branchGroup, curve, b, material, {
      thornsPerBranch: lowDetail ? 5 : 7,
      lowDetail,
      tubeRadius: tube
    });
    crown.add(branchGroup);
  }

  crown.rotation.x = -0.12;
  crown.rotation.y = 0;
  crown.scale.setScalar(0.82);
  return crown;
}

export async function initHeroCrown(canvas, container) {
  const THREE = await loadThree();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lowDetail = isCoarse || prefersReduced;
  const canAnimate = !prefersReduced;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !lowDetail,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowDetail ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 4.05, 1.08);
  camera.lookAt(0, 0, 0);

  let envMap = null;
  try {
    envMap = await createEnvironmentMap(THREE, renderer);
  } catch (err) {
    console.warn('RoomEnvironment unavailable; crown reflections disabled', err);
  }
  const crown = buildCrownOfThorns(THREE, envMap, lowDetail);
  scene.add(crown);

  scene.add(new THREE.AmbientLight(0x4a0808, 0.32));
  const key = new THREE.DirectionalLight(0xfff4f4, 2.4);
  key.position.set(-1.2, 3.2, 1.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xff4444, 0.48);
  fill.position.set(1.4, 0.6, 1.2);
  scene.add(fill);
  const under = new THREE.PointLight(0xff1818, 10, 12);
  under.position.set(0, -0.4, 0.3);
  scene.add(under);
  const rim = new THREE.PointLight(0xff3030, 9, 18);
  rim.position.set(0, 1.2, 2.4);
  scene.add(rim);

  const baseRotX = -0.12;
  const stage = container.closest('.hero-crown-stage') || container;
  const idleSpinSpeed = 0.00012;
  const hoverBoostExtra = 0.00007;
  // rad per scrolled pixel — visible on iOS even when rAF is paused mid-scroll
  const scrollSpinPerPx = 0.0055;
  const scrollBoostExtra = 0.0002;
  const scrollBoostCap = 1;

  let resonanceBoost = 0;
  let targetResonanceBoost = 0;
  let scrollBoost = 0;
  let spinAngle = 0;
  let lastFrameTime = 0;
  let lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;

  function useScrollSpin() {
    return window.innerWidth <= 900
      || window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches;
  }

  if (stage && canHover) {
    stage.addEventListener('mouseenter', () => { targetResonanceBoost = 1; });
    stage.addEventListener('mouseleave', () => { targetResonanceBoost = 0; });
  }

  function paintCrown() {
    crown.rotation.x = baseRotX;
    crown.rotation.y = spinAngle;
    under.intensity = 10 + resonanceBoost * 4;
    rim.intensity = 9 + resonanceBoost * 3.5;
    fill.intensity = 0.48 + resonanceBoost * 0.2;
    renderer.render(scene, camera);
  }

  if (canAnimate) {
    window.addEventListener('scroll', () => {
      if (!useScrollSpin()) return;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const dy = y - lastScrollY;
      lastScrollY = y;
      if (!dy) return;

      // Drive rotation directly from scroll delta (works while iOS pauses rAF)
      spinAngle += Math.abs(dy) * scrollSpinPerPx;
      scrollBoost = Math.min(scrollBoostCap, scrollBoost + Math.min(0.85, Math.abs(dy) / 70));
      targetResonanceBoost = Math.min(1, scrollBoost * 0.5);
      resonanceBoost += (targetResonanceBoost - resonanceBoost) * 0.35;
      paintCrown();
    }, { passive: true });
  }

  let rafId = 0;
  let visible = true;

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(time) {
    if (!visible) return;

    if (!lastFrameTime) lastFrameTime = time;
    const dt = Math.min(48, Math.max(0, time - lastFrameTime));
    lastFrameTime = time;

    if (useScrollSpin() && scrollBoost > 0) {
      scrollBoost *= Math.exp(-dt / 380);
      if (scrollBoost < 0.02) {
        scrollBoost = 0;
        targetResonanceBoost = 0;
      } else {
        targetResonanceBoost = Math.min(1, scrollBoost * 0.5);
      }
    }

    resonanceBoost += (targetResonanceBoost - resonanceBoost) * (1 - Math.exp(-dt / 85));

    if (canAnimate) {
      const hoverExtra = canHover ? resonanceBoost * hoverBoostExtra : 0;
      const scrollExtra = useScrollSpin() ? scrollBoost * scrollBoostExtra : 0;
      spinAngle += dt * (idleSpinSpeed + hoverExtra + scrollExtra);
    }

    paintCrown();
  }

  function loop(time) {
    render(time);
    rafId = requestAnimationFrame(loop);
  }

  resize();
  if (canAnimate) {
    rafId = requestAnimationFrame(loop);
  } else {
    paintCrown();
  }

  new ResizeObserver(resize).observe(container);

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) lastFrameTime = 0;
    if (visible && canAnimate && !rafId) rafId = requestAnimationFrame(loop);
    if (!visible && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  });

  return { renderer, scene, crown };
}
