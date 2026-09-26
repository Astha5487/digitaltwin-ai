/**
 * The 3D factory.
 *
 * Simple geometry on purpose: boxes for stations, a ribbon for the conveyor,
 * glowing points for parts moving down the line. Every zone is clickable and
 * every zone can be zoomed into - not just the one with the problem.
 */
import * as THREE from "three";

// Matches the app palette: black floor, quiet metal, colour only for status.
const COLOR = {
  healthy: 0x9a9aa6,   // quiet metal: nominal needs no colour
  warning: 0xf5b942,
  critical: 0xff6b6b,
  violet: 0x7aa2ff,    // accent: flow, inferred sensing
  deck: 0x0a0a0c,
  rail: 0x26262c,
  body: 0x303038,
};

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Four zones laid left to right, sized so blocks never crowd each other.
const ZONES = [
  { id: "body",  x: -40, span: 18, blocks: 12 },
  { id: "paint", x: -18, span: 12, blocks: 8 },
  { id: "final", x: 14,  span: 34, blocks: 14 },
  { id: "qc",    x: 40,  span: 8,  blocks: 6 },
];

export function createFactory(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 60, 150);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(18, 30, 20);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe6ff, 0.35);
  rim.position.set(-22, 14, -18);
  scene.add(rim);

  const world = new THREE.Group();
  scene.add(world);

  // ------------------------------------------------------------------ deck --
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(108, 0.6, 44),
    new THREE.MeshStandardMaterial({ color: COLOR.deck, roughness: 0.95 })
  );
  deck.position.y = -0.9;
  world.add(deck);

  const grid = new THREE.GridHelper(130, 46, COLOR.rail, COLOR.rail);
  grid.position.y = -0.57;
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  world.add(grid);

  // ----------------------------------------------------------------- zones --
  const blocks = [];       // every station block in the plant
  const zonePads = [];     // invisible click targets, one per zone

  ZONES.forEach((zone) => {
    const g = new THREE.Group();
    g.position.x = zone.x;
    world.add(g);

    // conveyor ribbon
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(zone.span + 4, 0.25, 2.2),
      new THREE.MeshStandardMaterial({ color: COLOR.rail, emissive: 0x0c0c10 })
    ));

    // an invisible slab over the zone, so clicking anywhere zooms in
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(zone.span + 5, 5, 9),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pad.position.set(0, 2, -1.4);
    pad.userData.zone = zone.id;
    g.add(pad);
    zonePads.push(pad);

    for (let i = 0; i < zone.blocks; i++) {
      const t = zone.blocks === 1 ? 0.5 : i / (zone.blocks - 1);
      const x = lerp(-zone.span / 2, zone.span / 2, t);
      const h = 1.9 + (i % 3) * 0.32;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, h, 1.4),
        new THREE.MeshStandardMaterial({
          color: COLOR.body, roughness: 0.55, metalness: 0.25,
          emissive: COLOR.healthy, emissiveIntensity: 0,
        })
      );
      mesh.position.set(x, h / 2 + 0.15, -1.9);
      g.add(mesh);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 14, 14),
        new THREE.MeshBasicMaterial({ color: COLOR.healthy })
      );
      lamp.position.set(x, h + 0.48, -1.9);
      g.add(lamp);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 14, 14),
        new THREE.MeshBasicMaterial({ color: COLOR.healthy, transparent: true, opacity: 0.16 })
      );
      halo.position.copy(lamp.position);
      g.add(halo);

      // a dashed ring marks a station the twin can only infer
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.035, 8, 28),
        new THREE.MeshBasicMaterial({ color: COLOR.violet, transparent: true, opacity: 0 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.2, -1.9);
      g.add(ring);

      blocks.push({
        mesh, lamp, halo, ring,
        zone: zone.id, index: i,
        worldX: zone.x + x, baseY: h / 2 + 0.15, height: h,
        status: "healthy", sensing: "full", code: null,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  });

  // -------------------------------------------------------------- particles --
  const N = 52;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(N * 3);
  const prog = new Float32Array(N);
  for (let i = 0; i < N; i++) prog[i] = i / N;
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: COLOR.violet, size: 0.5, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  world.add(particles);
  const START = -54, END = 50;

  // ------------------------------------------------- shadow-sensor feed rays --
  const shadowGroup = new THREE.Group();
  shadowGroup.visible = false;
  world.add(shadowGroup);
  const rays = [];
  [[-8, 7, -6], [-4, 9, 5], [5, 8, -7], [9, 7, 4]].forEach((off) => {
    const start = new THREE.Vector3(...off);
    const end = new THREE.Vector3(0, 0, 0);
    const mat = new THREE.LineDashedMaterial({
      color: COLOR.violet, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.5,
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), mat);
    line.computeLineDistances();
    shadowGroup.add(line);
    // A bead travels each ray. (LineDashedMaterial has no dashOffset, so the
    // sense of direction has to come from a moving object.)
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 10),
      new THREE.MeshBasicMaterial({ color: COLOR.violet, transparent: true })
    );
    shadowGroup.add(bead);
    rays.push({ mat, bead, start, end, phase: Math.random() });
  });

  // ------------------------------------------------------------------ camera --
  const PLANT = { pos: new THREE.Vector3(0, 46, 60), look: new THREE.Vector3(0, 0, -2) };
  let camFrom = PLANT.pos.clone(), camTo = PLANT.pos.clone();
  let lookFrom = PLANT.look.clone(), lookTo = PLANT.look.clone();
  const camBase = PLANT.pos.clone();       // where the camera *should* sit
  const curLook = PLANT.look.clone();
  let camT = 1, camStart = 0;
  const CAM_MS = 1100;
  camera.position.copy(camBase);
  camera.lookAt(curLook);

  function moveTo(pos, look) {
    camFrom = camBase.clone();
    lookFrom = curLook.clone();
    camTo = pos.clone();
    lookTo = look.clone();
    camT = 0;
    camStart = performance.now();
  }

  function setMode(next, zoneId = null) {
    if (next === "plant") return moveTo(PLANT.pos, PLANT.look);
    const zone = ZONES.find((z) => z.id === zoneId) ?? ZONES[2];
    if (next === "line") {
      // Frame the whole zone: pull back in proportion to how long it is.
      const dist = Math.max(20, zone.span * 0.95);
      return moveTo(new THREE.Vector3(zone.x, dist * 0.55, dist),
                    new THREE.Vector3(zone.x, 1.5, -2));
    }
    if (next === "focus") {
      const b = blocks.find((x) => x.code === focusCode) ??
                blocks.find((x) => x.zone === zone.id);
      const fx = b ? b.worldX : zone.x;
      // Frame the station left of centre, leaving room for the detail card on the right.
      return moveTo(new THREE.Vector3(fx + 7, 8, 15), new THREE.Vector3(fx + 4, 2, -2));
    }
  }

  // -------------------------------------------------------------- interaction --
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let hovered = null;
  let onPickStation = () => {};
  let onPickZone = () => {};
  let onHoverStation = () => {};

  const onLeave = () => { pointer.set(-2, -2); };
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  const onClick = () => {
    if (hovered?.code) return onPickStation(hovered);
    // no station under the cursor: fall back to the zone slab
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(zonePads, false)[0];
    if (hit) onPickZone(hit.object.userData.zone);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);

  // -------------------------------------------------------------------- state --
  let flowSpeed = 1;
  let shadowOn = false;
  let focusCode = null;

  /** Map live station data onto the blocks of each zone. */
  function applyState({ lines = [], flow = 1, focus = null }) {
    flowSpeed = flow;
    focusCode = focus;

    ZONES.forEach((zone) => {
      const line = lines.find((l) => l.id === zone.id);
      const mine = blocks.filter((b) => b.zone === zone.id);
      if (!line) return;
      const st = line.stations;
      mine.forEach((b, i) => {
        let s;
        if (st.length <= mine.length) {
          s = st[i];                                  // 1:1
        } else {
          // more stations than blocks: sample evenly, but always keep the focus
          const idx = Math.round((i / (mine.length - 1)) * (st.length - 1));
          s = st[idx];
          const fi = st.findIndex((x) => x.code === focus);
          if (fi >= 0 && i === Math.round((fi / (st.length - 1)) * (mine.length - 1))) {
            s = st[fi];
          }
        }
        if (!s) { b.code = null; return; }
        b.code = s.code;
        b.status = s.status;
        b.sensing = s.sensing;
      });
    });
  }

  function setShadow(on, code = null) {
    shadowOn = on;
    shadowGroup.visible = on;
    const b = blocks.find((x) => x.code === (code ?? focusCode));
    if (b) shadowGroup.position.set(b.worldX, b.height + 1, -1.9);
  }

  function highlight(code) { focusCode = code; }

  // ---------------------------------------------------------------- animation --
  let raf = 0, last = performance.now(), t = 0;

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Hold the horizontal field of view steady so narrow stages still show every line.
      camera.fov = Math.min(80, Math.max(42, (2 * Math.atan(0.78 / camera.aspect) * 180) / Math.PI));
      camera.updateProjectionMatrix();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    resize();

    if (camT < 1) {
      camT = Math.min(1, (now - camStart) / CAM_MS);
      const e = easeOut(camT);
      camBase.lerpVectors(camFrom, camTo, e);
      curLook.lerpVectors(lookFrom, lookTo, e);
    }
    // Drift is an offset from the resting position, never accumulated onto it,
    // so the camera can't wander away from what it is supposed to be showing.
    camera.position.set(camBase.x + Math.sin(t * 0.22) * 1.1, camBase.y, camBase.z);
    camera.lookAt(curLook);

    blocks.forEach((b) => {
      const dim = b.code === null;
      const target = COLOR[b.status] ?? COLOR.healthy;
      b.lamp.material.color.lerp(new THREE.Color(target), 0.09);
      b.halo.material.color.copy(b.lamp.material.color);
      b.mesh.material.emissive.copy(b.lamp.material.color);

      const urgent = b.status === "critical" ? 1 : b.status === "warning" ? 0.5 : 0;
      b.pulse += dt * (2 + urgent * 3.5);
      const beat = 1 + Math.sin(b.pulse) * (0.1 + urgent * 0.42);
      b.halo.scale.setScalar(beat * (1 + urgent * 0.7));
      b.halo.material.opacity = dim ? 0 : 0.12 + urgent * 0.22;
      b.mesh.material.emissiveIntensity = lerp(
        b.mesh.material.emissiveIntensity, dim ? 0.02 : 0.1 + urgent * 0.5, 0.08);

      // shadow-sensed stations wear a soft violet ring
      const wantRing = b.sensing === "shadow" ? 0.5 + Math.sin(t * 2 + b.pulse) * 0.2
                     : b.sensing === "manual" ? 0.14 : 0;
      b.ring.material.opacity = lerp(b.ring.material.opacity, dim ? 0 : wantRing, 0.1);

      const sel = b.code && b.code === focusCode;
      const hot = hovered && hovered.mesh === b.mesh;
      // hovered machine rises a touch and its lamp brightens — a quiet acknowledgement
      b.mesh.position.y = lerp(b.mesh.position.y,
        b.baseY + (b.status === "critical" ? 0.26 : 0) + (sel ? 0.3 : 0) + (hot ? 0.22 : 0), 0.14);
      b.lamp.position.y = b.mesh.position.y + b.height / 2 + 0.33;
      b.halo.position.y = b.lamp.position.y;
      if (hot) {
        b.halo.material.opacity = Math.max(b.halo.material.opacity, 0.34);
        b.mesh.material.emissiveIntensity = Math.max(b.mesh.material.emissiveIntensity, 0.32);
      }
      const s = hot ? 1.28 : sel ? 1.15 : 1;
      b.mesh.scale.x = lerp(b.mesh.scale.x, s, 0.15);
      b.mesh.scale.z = lerp(b.mesh.scale.z, s, 0.15);
    });

    const pos = particles.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      prog[i] += dt * 0.055 * flowSpeed;
      if (prog[i] > 1) prog[i] -= 1;
      const p = prog[i];
      pos[i * 3] = lerp(START, END, p);
      pos[i * 3 + 1] = 0.55 + Math.sin(p * 34 + t * 2) * 0.08;
      pos[i * 3 + 2] = 0;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    if (shadowOn) {
      rays.forEach((r, i) => {
        r.phase = (r.phase + dt * 0.5) % 1;
        r.bead.position.lerpVectors(r.start, r.end, r.phase);
        r.bead.material.opacity = Math.sin(r.phase * Math.PI);
        r.mat.opacity = 0.34 + Math.sin(t * 2 + i) * 0.16;
      });
    }

    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(blocks.map((b) => b.mesh), false)[0];
    const found = hit ? blocks.find((b) => b.mesh === hit.object) : null;
    if (found !== hovered) {
      hovered = found;
      canvas.style.cursor = hovered?.code ? "pointer" : "default";
      onHoverStation(hovered?.code ? { code: hovered.code, zone: hovered.zone } : null);
    }

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  /** Project a station to 2D screen coords, for floating cards. */
  function screenPos(code) {
    const b = blocks.find((x) => x.code === code);
    if (!b) return null;
    const v = new THREE.Vector3(b.worldX, b.height + 1.4, -1.9).project(camera);
    if (v.z > 1) return null;
    return {
      x: ((v.x + 1) / 2) * canvas.clientWidth,
      y: ((-v.y + 1) / 2) * canvas.clientHeight,
    };
  }

  function dispose() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("click", onClick);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    renderer.dispose();
  }

  return {
    applyState, setMode, setShadow, highlight, screenPos, dispose,
    onStation: (fn) => { onPickStation = fn; },
    onZone: (fn) => { onPickZone = fn; },
    onHover: (fn) => { onHoverStation = fn ?? (() => {}); },
  };
}
