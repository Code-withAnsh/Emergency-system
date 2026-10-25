import * as THREE from 'three';

// A small city block with one incident, shown as a story in 4 beats (progress 0 to 1 maps to 0 to 4):
//   0 to 1  the pin drops in
//   1 to 2  nearby units are scored (halos)
//   2 to 3  the best unit is picked and the route draws
//   3 to 4  the unit drives in and the pin turns green
// Hero mode plays the story on a loop. Story mode follows the scroll position.

const COLORS = { cyan: 0x22d3ee, emerald: 0x34d399, rose: 0xf43f5e, bg: 0x0b1220, line: 0x1f3a55, building: 0x2c4d70 };
const PIN = new THREE.Vector3(3.6, 0, -1.8);
const CHOSEN_START = new THREE.Vector3(-5.4, 0, 2.8); // ambulance the ranking picks (further away, but faster)
const NEAREST = new THREE.Vector3(2.4, 0, -0.2);      // nearest unit, but it is busy
const ROUTE_POINTS = 60;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// Seeded random, so the same city appears on every visit
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

// Returns null when WebGL is not available. The page then keeps its CSS background.
export function createCity(canvas, { reduce = false, autoplay = false, getProgress, pointer }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.bg, 16, 34);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);

  // Everything created here is freed in dispose()
  const disposables = [];
  const track = (obj) => { disposables.push(obj); return obj; };

  // Floor grid
  const grid = new THREE.GridHelper(32, 32, COLORS.cyan, COLORS.line);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  world.add(grid);
  track(grid.geometry);
  track(grid.material);

  // Blueprint-style buildings (edges only)
  const rand = seeded(7);
  const edgeMat = track(new THREE.LineBasicMaterial({ color: COLORS.building, transparent: true, opacity: 0.9 }));
  for (let i = 0; i < 44; i += 1) {
    const w = 0.5 + rand() * 0.9;
    const h = 0.3 + rand() * 2.1;
    const d = 0.5 + rand() * 0.9;
    const x = (rand() - 0.5) * 24;
    const z = (rand() - 0.5) * 24;
    if (Math.hypot(x - PIN.x, z - PIN.z) < 1.8) continue; // keep the pin's street clear
    const box = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.position.set(x, h / 2, z);
    world.add(lines);
    track(edges);
  }

  // Units: cyan ambulance, emerald bike, rose busy
  const ambMat = track(new THREE.MeshBasicMaterial({ color: COLORS.cyan }));
  const bikeMat = track(new THREE.MeshBasicMaterial({ color: COLORS.emerald }));
  const busyMat = track(new THREE.MeshBasicMaterial({ color: COLORS.rose }));
  const unitGeo = track(new THREE.SphereGeometry(0.16, 14, 10));
  const units = [];
  const addUnit = (pos, mat, type) => {
    const mesh = new THREE.Mesh(unitGeo, mat);
    mesh.position.set(pos.x, 0.16, pos.z);
    world.add(mesh);
    const unit = { mesh, base: pos.clone(), type, phase: rand() * Math.PI * 2 };
    units.push(unit);
    return unit;
  };
  const chosen = addUnit(CHOSEN_START, ambMat, 'amb');
  const nearest = addUnit(NEAREST, busyMat, 'bike');
  for (let i = 0; i < 40; i += 1) {
    const pos = new THREE.Vector3((rand() - 0.5) * 22, 0, (rand() - 0.5) * 22);
    if (pos.distanceTo(PIN) < 2 || pos.distanceTo(CHOSEN_START) < 1.5 || pos.distanceTo(NEAREST) < 1.2) continue;
    addUnit(pos, i % 2 ? ambMat : bikeMat, i % 2 ? 'amb' : 'bike');
  }
  // The two other units closest to the incident get a score halo
  const scored = units
    .filter((u) => u !== chosen && u !== nearest)
    .sort((a, b) => a.base.distanceTo(PIN) - b.base.distanceTo(PIN))
    .slice(0, 2);

  // Halos: flat rings on the floor
  const ringGeo = track(new THREE.RingGeometry(0.26, 0.34, 40));
  ringGeo.rotateX(-Math.PI / 2);
  const makeRing = (color) => {
    const mat = track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.visible = false;
    world.add(ring);
    return ring;
  };
  const nearestRing = makeRing(COLORS.rose);
  const scoredRings = scored.map(() => makeRing(COLORS.cyan));
  const chosenRing = makeRing(COLORS.emerald);
  const pulse = makeRing(COLORS.rose);

  // Incident pin
  const pin = new THREE.Group();
  const pinMat = track(new THREE.MeshBasicMaterial({ color: COLORS.rose }));
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.24, 18, 12)), pinMat);
  head.position.y = 0.9;
  const tip = new THREE.Mesh(track(new THREE.ConeGeometry(0.14, 0.5, 14)), pinMat);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.45;
  pin.add(head, tip);
  world.add(pin);

  // Route line from the chosen unit to the pin. Drawn with setDrawRange.
  const routeGeo = track(new THREE.BufferGeometry());
  const routePos = new Float32Array(ROUTE_POINTS * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < ROUTE_POINTS; i += 1) {
    tmp.lerpVectors(CHOSEN_START, PIN, i / (ROUTE_POINTS - 1));
    routePos.set([tmp.x, 0.05, tmp.z], i * 3);
  }
  routeGeo.setAttribute('position', new THREE.BufferAttribute(routePos, 3));
  routeGeo.setDrawRange(0, 0);
  const routeMat = track(new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.95 }));
  world.add(new THREE.Line(routeGeo, routeMat));

  const rose = new THREE.Color(COLORS.rose);
  const emerald = new THREE.Color(COLORS.emerald);
  const lookAt = new THREE.Vector3(0.4, 0, -0.4);
  const scratch = new THREE.Vector3();
  let shown = 0; // smoothed progress, so the story eases between beats
  let width = 1;
  let height = 1;

  const placeRing = (ring, x, z, amount, scale = 1) => {
    ring.visible = amount > 0.01;
    ring.position.set(x, 0.03, z);
    ring.scale.setScalar(scale * (0.6 + 0.4 * amount));
    ring.material.opacity = 0.9 * amount;
  };

  function storyFrame(s, t) {
    const pinIn = smooth(s / 0.4);
    const scoreIn = smooth((s - 1) / 0.4);
    const routeIn = smooth((s - 2) / 0.6);
    const travel = smooth((s - 2.4) / 1.2);
    const arrived = smooth((travel - 0.9) / 0.1);

    // Pin drops in, turns green on arrival
    pin.visible = pinIn > 0.01;
    pin.position.set(PIN.x, (1 - pinIn) * 2.5, PIN.z);
    pin.scale.setScalar(Math.max(0.001, pinIn));
    pinMat.color.lerpColors(rose, emerald, arrived);

    // Units: idle bob and drift (more in hero mode). The chosen unit is set below.
    const drift = autoplay ? 0.35 : 0.12;
    for (const u of units) {
      if (u === chosen) continue;
      u.mesh.position.x = u.base.x + Math.sin(t * 0.0004 + u.phase) * drift;
      u.mesh.position.y = 0.16 + Math.sin(t * 0.002 + u.phase) * 0.03;
    }

    // The chosen unit drives along the route
    scratch.lerpVectors(CHOSEN_START, PIN, travel * 0.82);
    chosen.mesh.position.set(scratch.x, 0.16, scratch.z);
    routeGeo.setDrawRange(0, Math.round(ROUTE_POINTS * routeIn));

    // Halos
    placeRing(nearestRing, nearest.base.x, nearest.base.z, scoreIn);
    scoredRings.forEach((ring, i) => placeRing(ring, scored[i].base.x, scored[i].base.z, scoreIn));
    placeRing(chosenRing, chosen.mesh.position.x, chosen.mesh.position.z, smooth((s - 2) / 0.3), 1.35);
    chosenRing.material.color.copy(emerald);

    // Pulse around the pin (repeats every 1.6 s)
    const ph = (t * 0.000625) % 1;
    pulse.visible = pinIn > 0.5;
    pulse.position.set(PIN.x, 0.03, PIN.z);
    pulse.scale.setScalar(1 + ph * 4);
    pulse.material.opacity = (1 - ph) * 0.6;
    pulse.material.color.copy(pinMat.color);
  }

  function placeCamera(p, t) {
    const orbit = -0.55 + p * 0.5 + (pointer ? pointer.x * 0.1 : 0);
    const radius = 19;
    const y = 9 - (pointer ? pointer.y * 0.5 : 0) + Math.sin(t * 0.0003) * 0.15;
    camera.position.set(Math.sin(orbit) * radius, y, Math.cos(orbit) * radius);
    camera.lookAt(lookAt);
  }

  function render(t) {
    // Hero plays the story back and forth (smooth, no jump at the loop point)
    const target = autoplay && !reduce
      ? 0.5 - 0.5 * Math.cos(t * 0.00021)
      : (getProgress ? getProgress() : 0.5);
    shown = reduce ? target : shown + (target - shown) * 0.12;
    storyFrame(Math.min(3.999, shown * 4), t);
    placeCamera(shown, t);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    width = w;
    height = h;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 1 ? 58 : 42; // narrow phones need a wider view
    camera.updateProjectionMatrix();
  }

  let raf = 0;
  let running = false;
  const loop = (t) => {
    if (!running) return;
    render(t);
    raf = requestAnimationFrame(loop);
  };

  return {
    start() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    renderOnce() {
      render(performance.now());
    },
    resize,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      disposables.forEach((obj) => obj.dispose());
      renderer.dispose();
    }
  };
}
