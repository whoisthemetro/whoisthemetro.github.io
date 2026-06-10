/* ============================================================
   THE METRO — the station itself
   A procedural underground platform: glazed tile walls, humming
   fluorescents (one of them dying), a neon sign, benches, dust
   hanging in the air, and a track pit where a train passes
   through the dark every few minutes.

   Everything is generated in code — no texture files.

   Layout (meters):
     platform floor y=0, ceiling y=4.2
     hall x: -15..15
     platform z: -4.5 (note wall) .. 4.5 (platform edge)
     track pit z: 4.5..7.6, floor y=-1.1, far wall z=7.6
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";

export const ROOM = {
  X: 15, ZBACK: -4.5, ZEDGE: 4.5, ZFAR: 7.6, H: 4.2, PIT: -1.1,
  // where visitors can walk
  bounds: { minX: -14.3, maxX: 14.3, minZ: -3.95, maxZ: 4.05 },
};

/* ---------------- procedural textures ---------------- */

function tileTexture({ base = "#3f6e60", grout = "#16241f", grime = 0.4, px = 512, tile = 64 }) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  g.fillStyle = grout;
  g.fillRect(0, 0, px, px);
  const bc = new THREE.Color(base);
  for (let y = 0; y < px; y += tile) {
    for (let x = 0; x < px; x += tile) {
      const v = 1 + (Math.random() - 0.5) * 0.22;
      g.fillStyle = `rgb(${bc.r * 255 * v | 0},${bc.g * 255 * v | 0},${bc.b * 255 * v | 0})`;
      g.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      // glaze highlight
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.fillRect(x + 4, y + 4, tile - 8, 8);
    }
  }
  // grime creeping up from the floor
  const grad = g.createLinearGradient(0, px, 0, px * 0.55);
  grad.addColorStop(0, `rgba(8,8,6,${grime})`);
  grad.addColorStop(1, "rgba(8,8,6,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function concreteTexture(px = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  g.fillStyle = "#26292d";
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < 9000; i++) {
    const v = 34 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 3},${Math.random() * 0.5})`;
    g.fillRect(Math.random() * px, Math.random() * px, 1.5, 1.5);
  }
  // expansion joints
  g.strokeStyle = "rgba(0,0,0,0.5)";
  g.lineWidth = 3;
  for (const f of [0.25, 0.5, 0.75]) {
    g.beginPath(); g.moveTo(px * f, 0); g.lineTo(px * f, px); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stationSignTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 220;
  const g = c.getContext("2d");
  g.fillStyle = "#0e2433";
  g.fillRect(0, 0, 1024, 220);
  g.strokeStyle = "#dfe5e2";
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 192);
  g.fillStyle = "#dfe5e2";
  g.font = "900 130px Archivo, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.letterSpacing = "28px";
  g.fillText("METRO", 512, 104);
  g.font = "600 26px Archivo, sans-serif";
  g.letterSpacing = "8px";
  g.fillStyle = "#9fb4ad";
  g.fillText("YOU ARE HERE · EVERYONE WAS HERE", 512, 178);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonTexture(text = "THE METRO") {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 1024, 256);
  g.font = "500 150px 'Six Caps', Archivo, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.letterSpacing = "20px";
  g.shadowColor = "#ff4d2e";
  g.shadowBlur = 38;
  g.strokeStyle = "#ffd9cf";
  g.lineWidth = 7;
  for (let i = 0; i < 3; i++) g.strokeText(text, 512, 130);
  g.shadowBlur = 0;
  g.fillStyle = "#fff1ec";
  g.fillText(text, 512, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function trainSideTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#23262b";
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#31353c";
  g.fillRect(0, 0, 1024, 36);
  // lit windows with the occasional silhouette
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 142;
    g.fillStyle = "#ffd9a0";
    g.fillRect(x, 60, 104, 90);
    if (Math.random() < 0.4) {
      g.fillStyle = "#1c1d20";
      const px = x + 18 + Math.random() * 60;
      g.beginPath(); g.arc(px, 118, 16, 0, Math.PI * 2); g.fill();   // head
      g.fillRect(px - 22, 132, 44, 20);                              // shoulders
    }
  }
  g.fillStyle = "#101113";
  g.fillRect(0, 196, 1024, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- world ---------------- */

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.fog = new THREE.Fog(0x05070a, 12, 60);

  const { X, ZBACK, ZEDGE, ZFAR, H, PIT } = ROOM;

  const tileMat = new THREE.MeshLambertMaterial({ map: tileTexture({}) });
  tileMat.map.repeat.set(10, 3.5);
  const tileMatFar = new THREE.MeshLambertMaterial({ map: tileTexture({ base: "#475450", grime: 0.65 }) });
  tileMatFar.map.repeat.set(10, 3.5);
  const tileMatEnd = new THREE.MeshLambertMaterial({ map: tileTexture({}) });
  tileMatEnd.map.repeat.set(4, 3.5);

  const add = (mesh) => { scene.add(mesh); return mesh; };
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

  /* --- postable walls (the living surfaces) --- */
  // each: id, origin (bottom-left when facing the wall), uDir, vDir, normal, w, h, mesh
  const walls = [];

  const backWall = add(plane(2 * X, H, tileMat));
  backWall.position.set(0, H / 2, ZBACK);
  walls.push({
    id: "back", mesh: backWall, w: 2 * X, h: H,
    origin: new THREE.Vector3(-X, 0, ZBACK),
    uDir: new THREE.Vector3(1, 0, 0),
    vDir: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, 1),
  });

  const westWall = add(plane(ZEDGE - ZBACK, H, tileMatEnd));
  westWall.rotation.y = Math.PI / 2;
  westWall.position.set(-X, H / 2, (ZBACK + ZEDGE) / 2);
  walls.push({
    id: "west", mesh: westWall, w: ZEDGE - ZBACK, h: H,
    origin: new THREE.Vector3(-X, 0, ZEDGE),
    uDir: new THREE.Vector3(0, 0, -1),
    vDir: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(1, 0, 0),
  });

  const eastWall = add(plane(ZEDGE - ZBACK, H, tileMatEnd));
  eastWall.rotation.y = -Math.PI / 2;
  eastWall.position.set(X, H / 2, (ZBACK + ZEDGE) / 2);
  walls.push({
    id: "east", mesh: eastWall, w: ZEDGE - ZBACK, h: H,
    origin: new THREE.Vector3(X, 0, ZBACK),
    uDir: new THREE.Vector3(0, 0, 1),
    vDir: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(-1, 0, 0),
  });

  /* --- non-postable shell --- */
  // far wall across the tracks
  const farWall = add(plane(2 * X + 30, H + Math.abs(PIT), tileMatFar));
  farWall.rotation.y = Math.PI;
  farWall.position.set(0, (H + PIT) / 2, ZFAR);

  // end-wall sections over the track pit, with black tunnel mouths
  for (const sx of [-1, 1]) {
    const fill = add(plane(ZFAR - ZEDGE, H + Math.abs(PIT), tileMatEnd.clone()));
    fill.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    fill.position.set(sx * X, (H + PIT) / 2, (ZEDGE + ZFAR) / 2);
    const mouth = add(plane(2.9, 3.4, new THREE.MeshBasicMaterial({ color: 0x000000 })));
    mouth.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
    mouth.position.set(sx * (X - 0.01), PIT + 1.7 + 0.2, 6.05);
  }

  // platform floor
  const floorMat = new THREE.MeshLambertMaterial({ map: concreteTexture() });
  floorMat.map.repeat.set(8, 3);
  const floor = add(plane(2 * X, ZEDGE - ZBACK, floorMat));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (ZBACK + ZEDGE) / 2);

  // warning line at the platform edge
  const stripe = add(plane(2 * X, 0.42, new THREE.MeshLambertMaterial({ color: 0xc9a13c })));
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.005, ZEDGE - 0.45);

  // platform edge face + pit
  const edgeFace = add(plane(2 * X, Math.abs(PIT), new THREE.MeshLambertMaterial({ color: 0x101214 })));
  edgeFace.rotation.y = Math.PI;
  edgeFace.position.set(0, PIT / 2, ZEDGE);
  const pitFloor = add(plane(2 * X + 30, ZFAR - ZEDGE, new THREE.MeshLambertMaterial({ color: 0x0a0b0c })));
  pitFloor.rotation.x = -Math.PI / 2;
  pitFloor.position.set(0, PIT, (ZEDGE + ZFAR) / 2);
  // rails
  for (const rz of [5.45, 6.85]) {
    const rail = add(new THREE.Mesh(
      new THREE.BoxGeometry(2 * X + 30, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x666a70, metalness: 0.9, roughness: 0.35 })));
    rail.position.set(0, PIT + 0.1, rz);
  }

  // ceiling
  const ceil = add(plane(2 * X, ZFAR - ZBACK, new THREE.MeshLambertMaterial({ color: 0x101417 })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, (ZBACK + ZFAR) / 2);

  /* --- pillars & benches --- */
  const pillarMat = new THREE.MeshLambertMaterial({ map: tileTexture({ base: "#1d3a33" }) });
  pillarMat.map.repeat.set(1.4, 5);
  for (const px of [-9, -3, 3, 9]) {
    const p = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, H, 0.55), pillarMat));
    p.position.set(px, H / 2, 2.3);
  }
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
  for (const bx of [-6, 0, 6]) {
    const seat = add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.55), woodMat));
    seat.position.set(bx, 0.48, -3.85);
    const back = add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.07), woodMat));
    back.position.set(bx, 0.95, -4.12);
    for (const lx of [-1.1, 1.1]) {
      const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x22262a })));
      leg.position.set(bx + lx, 0.24, -3.88);
    }
  }

  /* --- signs --- */
  const sign = add(plane(6, 1.3, new THREE.MeshBasicMaterial({ map: stationSignTexture() })));
  sign.rotation.y = Math.PI;
  sign.position.set(0, 2.4, ZFAR - 0.05);

  const neon = add(plane(5.4, 1.35, new THREE.MeshBasicMaterial({
    map: neonTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  neon.position.set(0, 3.62, ZBACK + 0.04);
  const neonLight = add(new THREE.PointLight(0xff4d2e, 30, 13, 2));
  neonLight.position.set(0, 3.4, ZBACK + 0.8);

  /* --- lighting --- */
  add(new THREE.AmbientLight(0x707a85, 1.5));
  add(new THREE.HemisphereLight(0x4a5a60, 0x16181a, 1.1));
  const fluorescents = [];
  for (const fx of [-10.5, -3.5, 3.5, 10.5]) {
    const tube = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xeaf3e8 })));
    tube.position.set(fx, H - 0.06, 0.4);
    const l = add(new THREE.PointLight(0xdfeede, 90, 19, 2));
    l.position.set(fx, H - 0.5, 0.4);
    fluorescents.push({ tube, light: l, base: 90 });
  }
  // dim sodium glow over the tracks so the far wall reads
  for (const tx of [-7, 7]) {
    const l = add(new THREE.PointLight(0xc8b48a, 36, 17, 2));
    l.position.set(tx, H - 0.6, 6);
  }
  // the dying one — every station has one
  const dying = fluorescents[2];

  /* --- dust in the air --- */
  const DUST = 350;
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = [];
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = rand(-X, X);
    dustPos[i * 3 + 1] = rand(0.1, H);
    dustPos[i * 3 + 2] = rand(ZBACK, ZFAR);
    dustVel.push({ x: rand(-0.02, 0.02), y: rand(0.005, 0.03), z: rand(-0.02, 0.02) });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x8a949c, size: 0.022, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  /* --- the train --- */
  const train = new THREE.Group();
  const sideTex = trainSideTexture();
  const bodyMat = new THREE.MeshLambertMaterial({ map: sideTex });
  for (let i = 0; i < 5; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(7.0, 2.5, 2.3), bodyMat);
    car.position.x = i * 7.35;
    train.add(car);
  }
  const headlight = new THREE.PointLight(0xfff2d8, 140, 26, 2);
  headlight.position.set(-4, 0, -1.4);
  train.add(headlight);
  train.position.set(9999, PIT + 1.45, 6.15);
  train.visible = false;
  add(train);

  let trainT = -1;             // -1 idle, else 0..1 progress
  let trainDir = 1;
  let nextTrainAt = 18 + rand(0, 20);   // seconds until first train
  const TRAIN_TIME = 6.5;               // seconds to cross
  const TRAIN_SPAN = 110;               // travel distance
  let onTrainPass = null;

  /* --- groups for dynamic content --- */
  const noteGroup = new THREE.Group();  add(noteGroup);
  const ghostGroup = new THREE.Group(); add(ghostGroup);

  /* --- per-frame life --- */
  let elapsed = 0;
  function tick(dt) {
    elapsed += dt;

    // dust drift
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      const v = dustVel[i];
      p[i * 3] += v.x * dt; p[i * 3 + 1] += v.y * dt; p[i * 3 + 2] += v.z * dt;
      if (p[i * 3 + 1] > H) p[i * 3 + 1] = 0.05;
      if (p[i * 3] > X) p[i * 3] = -X; else if (p[i * 3] < -X) p[i * 3] = X;
      if (p[i * 3 + 2] > ZFAR) p[i * 3 + 2] = ZBACK; else if (p[i * 3 + 2] < ZBACK) p[i * 3 + 2] = ZFAR;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // neon breathing + sputter
    const breathe = 0.85 + 0.15 * Math.sin(elapsed * 1.7);
    const sputter = Math.random() < 0.004 ? 0.25 : 1;
    neonLight.intensity = 30 * breathe * sputter;
    neon.material.opacity = 0.92 * breathe * (sputter < 1 ? 0.5 : 1);

    // the dying fluorescent
    if (Math.random() < 0.013) {
      const dim = Math.random() < 0.5 ? 0.15 : 0.7;
      dying.light.intensity = dying.base * dim;
      dying.tube.material.color.setScalar(dim);
    } else if (dying.light.intensity < dying.base) {
      dying.light.intensity = dying.base;
      dying.tube.material.color.setScalar(1);
    }

    // trains
    if (trainT < 0) {
      nextTrainAt -= dt;
      if (nextTrainAt <= 0) {
        trainT = 0;
        trainDir = Math.random() < 0.5 ? 1 : -1;
        train.visible = true;
        if (onTrainPass) { try { onTrainPass(TRAIN_TIME); } catch (e) {} }
      }
    } else {
      trainT += dt / TRAIN_TIME;
      if (trainT >= 1) {
        trainT = -1;
        train.visible = false;
        train.position.x = 9999;
        nextTrainAt = rand(50, 140);
      } else {
        const x = (trainT * 2 - 1) * (TRAIN_SPAN / 2) * trainDir;
        train.position.x = x;
        headlight.position.x = trainDir > 0 ? -4 : 5 * 7.35 + 4;
      }
    }
  }

  return {
    scene, walls, noteGroup, ghostGroup, tick,
    bounds: ROOM.bounds,
    setTrainListener: fn => { onTrainPass = fn; },
    isTrainPassing: () => trainT >= 0,
  };
}
