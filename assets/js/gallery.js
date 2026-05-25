/* ============================================================
   METRO — 3D PHOTO GALLERY (cyberpunk walk-in)
   Walls: north (-z), south (+z), east (+x), west (-x), center (freestanding)
   Photos are placed automatically from METRO_DATA.PHOTOS
   ============================================================ */

window.METRO_GALLERY = (function () {
  const { PHOTOS } = window.METRO_DATA;

  // Room dimensions
  const ROOM = { w: 44, d: 36, h: 6.0 };
  const EYE_H = 1.65;
  const WALK_SPEED = 4.6;          // units/sec
  const TURN_SPEED = 0.0025;       // mouse sensitivity

  // Salon layout: uniform row height keeps tops/bottoms aligned within a row,
  // widths vary with each photo's aspect ratio.
  const ROW_HEIGHT     = 1.15;
  const ROW_GAP        = 0.32;
  const PHOTO_GAP      = 0.22;
  const ROW_COUNT      = 3;          // rows per wall
  const WALL_X_PADDING = 1.5;

  function init() {
    const container = document.getElementById("scene-gallery");
    container.innerHTML = "";
    container.classList.add("scene-3d");

    // Loading overlay
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "ENTERING GALLERY…";
    container.appendChild(loading);

    // Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.Fog(0x05060a, 12, 38);

    const camera = new THREE.PerspectiveCamera(
      72, container.clientWidth / container.clientHeight, 0.1, 200
    );
    camera.rotation.order = "YXZ";          // critical for FPS-style yaw/pitch
    camera.position.set(0, EYE_H, ROOM.d / 2 - 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // ----- ENVIRONMENT -----
    buildRoom(scene);
    addLighting(scene);

    // ----- PHOTOS -----
    const photoMeshes = []; // { mesh, photoData, originalIndex }
    layoutPhotos(scene, photoMeshes, () => loading.classList.add("hidden"));

    // ----- HUD -----
    const hud = document.createElement("div");
    hud.className = "scene-hud";
    hud.innerHTML = `
      <div class="exit-hint">ESC → BACK TO LOBBY</div>
      <div class="crosshair"></div>
      <div class="prompt" id="gallery-prompt">PRESS E TO VIEW</div>
      <div class="controls">
        <div>MOVE <span>WASD</span></div>
        <div>LOOK <span>MOUSE</span></div>
        <div>VIEW <span>E / CLICK</span></div>
        <div>BACK <span>ESC</span></div>
      </div>
    `;
    container.appendChild(hud);

    // Mobile controls
    const isMobile = matchMedia("(max-width: 720px)").matches;
    let mobile = null;
    if (isMobile) mobile = buildMobileControls(container);

    // ----- CONTROLS -----
    const keys = {};
    // yaw/pitch applied directly to camera.rotation (YXZ order):
    //   yaw=0 → camera faces -Z (into the room from the south)
    //   mouse right → yaw decreases → camera turns right
    //   mouse down  → pitch decreases → camera looks down
    let yaw = 0, pitch = 0;
    const PITCH_LIMIT = Math.PI / 2 - 0.05;
    let pointerLocked = false;

    function applyLook() {
      camera.rotation.x = pitch;
      camera.rotation.y = yaw;
      camera.rotation.z = 0;
    }
    applyLook();

    function overlayOpen() {
      return document.querySelector("#musicfull.show, #videoplayer.show, #photomodal.show");
    }
    function onKeyDown(e) {
      if (state.scene !== "gallery") return;
      if (e.target.matches("input, textarea")) return;
      if (overlayOpen()) return;
      keys[e.code] = true;
      if (e.key === "e" || e.key === "E") tryViewPhoto();
    }
    function onKeyUp(e) { if (overlayOpen()) return; keys[e.code] = false; }

    function onMouseMove(e) {
      if (!pointerLocked) return;
      yaw   -= e.movementX * TURN_SPEED;
      pitch -= e.movementY * TURN_SPEED;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    }
    function onCanvasClick() {
      if (!pointerLocked) {
        renderer.domElement.requestPointerLock?.();
      } else {
        tryViewPhoto();
      }
    }
    function onPointerLockChange() {
      pointerLocked = document.pointerLockElement === renderer.domElement;
    }

    renderer.domElement.addEventListener("click", onCanvasClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    function onResize() {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener("resize", onResize);

    // ----- INTERACTION -----
    const raycaster = new THREE.Raycaster();
    let hoveredPhoto = null;
    const promptEl = hud.querySelector("#gallery-prompt");

    function tryViewPhoto() {
      if (!hoveredPhoto) return;
      const idx = photoMeshes.findIndex(p => p.mesh === hoveredPhoto);
      const ordered = photoMeshes.map(p => p.photoData);
      window.METRO_PHOTO_MODAL.open(ordered, idx);
    }

    // ----- ANIMATION LOOP -----
    const clock = new THREE.Clock();
    let running = true;
    let raf;

    const _fwd = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);

    function loop() {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);

      // mobile look: applied each frame, deltas reset after consuming
      if (mobile && (mobile.lookX || mobile.lookY)) {
        yaw   -= mobile.lookX * 0.01;
        pitch -= mobile.lookY * 0.01;
        pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
        mobile.lookX = 0; mobile.lookY = 0;
      }

      applyLook();

      // movement inputs: +forward = into the camera's looking direction
      let forward = 0, strafe = 0;
      if (keys.KeyW || keys.ArrowUp)    forward += 1;
      if (keys.KeyS || keys.ArrowDown)  forward -= 1;
      if (keys.KeyA || keys.ArrowLeft)  strafe  -= 1;
      if (keys.KeyD || keys.ArrowRight) strafe  += 1;
      if (mobile) { strafe += mobile.x; forward -= mobile.y; } // joystick: up = forward

      if (forward || strafe) {
        const len = Math.hypot(forward, strafe);
        forward /= len; strafe /= len;

        // horizontal forward vector (ignore pitch so walking stays level)
        camera.getWorldDirection(_fwd);
        _fwd.y = 0; _fwd.normalize();
        // right-hand vector: forward × up gives camera-right in Three.js coords
        _right.crossVectors(_fwd, _up).normalize();

        const step = WALK_SPEED * dt;
        camera.position.addScaledVector(_fwd,   forward * step);
        camera.position.addScaledVector(_right, strafe  * step);
      }

      // keep inside room
      const margin = 0.5;
      camera.position.x = Math.max(-ROOM.w/2 + margin, Math.min(ROOM.w/2 - margin, camera.position.x));
      camera.position.z = Math.max(-ROOM.d/2 + margin, Math.min(ROOM.d/2 - margin, camera.position.z));
      camera.position.y = EYE_H;

      // raycast for hover (use full camera look direction incl. pitch)
      camera.getWorldDirection(_fwd);
      raycaster.set(camera.position, _fwd.clone());
      const hits = raycaster.intersectObjects(photoMeshes.map(p => p.mesh), true);
      let hitMesh = null;
      if (hits.length && hits[0].distance < 3.2) {
        // walk up parents to find the group that's in photoMeshes
        let n = hits[0].object;
        while (n && !photoMeshes.find(p => p.mesh === n)) n = n.parent;
        hitMesh = n || null;
      }
      if (hitMesh !== hoveredPhoto) {
        if (hoveredPhoto) hoveredPhoto.userData.glow.material.opacity = 0.35;
        hoveredPhoto = hitMesh;
        if (hoveredPhoto) hoveredPhoto.userData.glow.material.opacity = 0.9;
        promptEl.classList.toggle("show", !!hoveredPhoto);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }

    // start/stop interface
    const state = { scene: "gallery" };
    const api = {
      start() {
        running = true;
        state.scene = "gallery";
        clock.start();
        if (!raf) loop();
      },
      stop() {
        running = false;
        state.scene = "";
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        cancelAnimationFrame(raf); raf = null;
      },
    };

    // touch-click for mobile action button
    if (mobile) mobile.action.addEventListener("click", tryViewPhoto);

    loop();
    return api;
  }

  /* ----- room geometry ----- */
  function buildRoom(scene) {
    // floor: dark + neon grid
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d14, roughness: 0.85, metalness: 0.1,
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      floorMat
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // floor glow grid (emissive lines)
    const gridGeo = new THREE.BufferGeometry();
    const lines = [];
    const step = 1.5;
    for (let x = -ROOM.w/2; x <= ROOM.w/2 + 0.01; x += step) {
      lines.push(x, 0.02, -ROOM.d/2, x, 0.02, ROOM.d/2);
    }
    for (let z = -ROOM.d/2; z <= ROOM.d/2 + 0.01; z += step) {
      lines.push(-ROOM.w/2, 0.02, z, ROOM.w/2, 0.02, z);
    }
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.18 });
    scene.add(new THREE.LineSegments(gridGeo, gridMat));

    // ceiling
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x080a10, roughness: 0.9 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM.h;
    scene.add(ceil);

    // walls — dark with neon trim
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x10131c, roughness: 0.85, metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const mkWall = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);

    // north wall (-z)
    const north = mkWall(ROOM.w, ROOM.h);
    north.position.set(0, ROOM.h/2, -ROOM.d/2);
    scene.add(north);
    // south wall (+z)
    const south = mkWall(ROOM.w, ROOM.h);
    south.position.set(0, ROOM.h/2, ROOM.d/2);
    south.rotation.y = Math.PI;
    scene.add(south);
    // east wall (+x)
    const east = mkWall(ROOM.d, ROOM.h);
    east.position.set(ROOM.w/2, ROOM.h/2, 0);
    east.rotation.y = -Math.PI/2;
    scene.add(east);
    // west wall (-x)
    const west = mkWall(ROOM.d, ROOM.h);
    west.position.set(-ROOM.w/2, ROOM.h/2, 0);
    west.rotation.y = Math.PI/2;
    scene.add(west);

    // neon trim along the top of each wall
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00ffd0 });
    function addTrim(w, x, z, ry) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.04), trimMat);
      t.position.set(x, ROOM.h - 0.12, z);
      t.rotation.y = ry;
      scene.add(t);
    }
    addTrim(ROOM.w, 0, -ROOM.d/2 + 0.03, 0);
    addTrim(ROOM.w, 0,  ROOM.d/2 - 0.03, 0);
    addTrim(ROOM.d,  ROOM.w/2 - 0.03, 0, Math.PI/2);
    addTrim(ROOM.d, -ROOM.w/2 + 0.03, 0, Math.PI/2);

    // baseboard glow (magenta)
    const trimMat2 = new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.6 });
    function addBase(w, x, z, ry) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.06), trimMat2);
      t.position.set(x, 0.05, z);
      t.rotation.y = ry;
      scene.add(t);
    }
    addBase(ROOM.w, 0, -ROOM.d/2 + 0.05, 0);
    addBase(ROOM.w, 0,  ROOM.d/2 - 0.05, 0);
    addBase(ROOM.d,  ROOM.w/2 - 0.05, 0, Math.PI/2);
    addBase(ROOM.d, -ROOM.w/2 + 0.05, 0, Math.PI/2);
  }

  function addLighting(scene) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    // soft hemi
    const hemi = new THREE.HemisphereLight(0x4a5680, 0x05060a, 0.3);
    scene.add(hemi);
    // accent point lights (cyan/magenta) at corners
    const colors = [0x00ffd0, 0xff2bd6, 0x00ffd0, 0xff2bd6];
    const positions = [
      [-ROOM.w/2 + 2, ROOM.h - 0.5, -ROOM.d/2 + 2],
      [ ROOM.w/2 - 2, ROOM.h - 0.5, -ROOM.d/2 + 2],
      [-ROOM.w/2 + 2, ROOM.h - 0.5,  ROOM.d/2 - 2],
      [ ROOM.w/2 - 2, ROOM.h - 0.5,  ROOM.d/2 - 2],
    ];
    positions.forEach((p, i) => {
      const l = new THREE.PointLight(colors[i], 0.9, 18, 1.5);
      l.position.set(...p);
      scene.add(l);
    });
    // "spotlight" overhead (centered)
    const center = new THREE.PointLight(0xffffff, 0.4, 22, 1.5);
    center.position.set(0, ROOM.h - 0.3, 0);
    scene.add(center);
  }

  /* ----- photo layout -----
     1. Load all textures (need aspect ratios)
     2. Auto-assign walls round-robin if photo.wall is missing
     3. For each wall: pack into ROW_COUNT rows, salon style
        (uniform row height, varied widths from aspect ratio)
  */
  function layoutPhotos(scene, photoMeshes, doneCb) {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    const wallsCfg = {
      north: { z: -ROOM.d/2 + 0.05, axis: "x", length: ROOM.w - 2 * WALL_X_PADDING, ry: 0          },
      south: { z:  ROOM.d/2 - 0.05, axis: "x", length: ROOM.w - 2 * WALL_X_PADDING, ry: Math.PI    },
      east:  { x:  ROOM.w/2 - 0.05, axis: "z", length: ROOM.d - 2 * WALL_X_PADDING, ry: -Math.PI/2 },
      west:  { x: -ROOM.w/2 + 0.05, axis: "z", length: ROOM.d - 2 * WALL_X_PADDING, ry:  Math.PI/2 },
    };

    if (!PHOTOS.length) { doneCb(); return; }

    let pending = PHOTOS.length;
    const loaded = PHOTOS.map(() => null);
    PHOTOS.forEach((p, i) => {
      loader.load(p.src, (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = 8;
        loaded[i] = { tex, w: tex.image.width, h: tex.image.height, photo: p };
        if (--pending === 0) { performLayout(scene, photoMeshes, loaded, wallsCfg); doneCb(); }
      }, undefined, () => {
        loaded[i] = { tex: null, w: 1, h: 1, photo: p };
        if (--pending === 0) { performLayout(scene, photoMeshes, loaded, wallsCfg); doneCb(); }
      });
    });
  }

  function performLayout(scene, photoMeshes, loaded, wallsCfg) {
    // Auto-assign walls round-robin for any photo without an explicit wall.
    const wallOrder = ["north", "east", "south", "west"];
    let rrIndex = 0;
    const byWall = { north: [], east: [], south: [], west: [] };
    loaded.forEach(item => {
      if (!item || !item.tex) return;
      let wall = item.photo.wall;
      if (!byWall[wall]) { wall = wallOrder[rrIndex++ % wallOrder.length]; }
      byWall[wall].push(item);
    });

    Object.entries(byWall).forEach(([wallName, items]) => {
      const cfg = wallsCfg[wallName];
      if (!cfg || !items.length) return;
      placeOnWall(scene, photoMeshes, items, cfg);
    });
  }

  // Place items on a wall in ROW_COUNT salon rows.
  // Each row is packed left-to-right; widths scale to fit the wall length.
  function placeOnWall(scene, photoMeshes, items, cfg) {
    // Compute each item's "natural" width at ROW_HEIGHT
    items.forEach(it => {
      const aspect = it.w / it.h;
      it.layoutH = ROW_HEIGHT;
      it.layoutW = ROW_HEIGHT * aspect;
    });

    // Distribute round-robin into rows so adjacent photos vary
    const rows = Array.from({ length: ROW_COUNT }, () => []);
    items.forEach((it, i) => rows[i % ROW_COUNT].push(it));

    // Vertical placement: stack rows centered around 2.7m (eye height + a bit)
    const totalH = ROW_COUNT * ROW_HEIGHT + (ROW_COUNT - 1) * ROW_GAP;
    const topY = 2.7 + totalH / 2 - ROW_HEIGHT / 2;

    rows.forEach((row, ri) => {
      if (!row.length) return;
      const rowY = topY - ri * (ROW_HEIGHT + ROW_GAP);

      // Natural total width of this row
      const naturalW = row.reduce((s, x) => s + x.layoutW, 0) + (row.length - 1) * PHOTO_GAP;

      // If the row overflows the wall, scale all widths down uniformly
      // (we keep heights variable so photos still fit visually)
      let scale = 1;
      if (naturalW > cfg.length) {
        scale = cfg.length / naturalW;
      }
      const finalW = naturalW * scale;
      let cursor = -finalW / 2;

      row.forEach(it => {
        const w = it.layoutW * scale;
        const h = it.layoutH * scale;
        const xCenter = cursor + w / 2;
        cursor += w + PHOTO_GAP * scale;
        addPhotoMesh(scene, photoMeshes, it, xCenter, rowY, w, h, cfg);
      });
    });
  }

  function addPhotoMesh(scene, photoMeshes, item, alongAxis, y, w, h, cfg) {
    if (!item.tex) return;
    const mesh = makePhotoFrame(item.tex, w, h);
    if (cfg.axis === "x") {
      mesh.position.set(alongAxis, y, cfg.z);
    } else {
      mesh.position.set(cfg.x, y, alongAxis);
    }
    mesh.rotation.y = cfg.ry;
    scene.add(mesh);
    photoMeshes.push({ mesh, photoData: item.photo });
  }

  function makePhotoFrame(tex, w, h) {
    // base group
    const group = new THREE.Group();

    // photo plane
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), planeMat);
    plane.position.z = 0.011;
    group.add(plane);

    // dark frame around photo
    const frameDepth = 0.05;
    const frameInset = 0.06;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.85 });
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + frameInset * 2, h + frameInset * 2, frameDepth),
      frameMat
    );
    frame.position.z = -frameDepth/2 + 0.005;
    group.add(frame);

    // neon glow (slightly larger plane behind)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffd0, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.28, h + 0.28), glowMat);
    glow.position.z = -0.02;
    group.add(glow);
    group.userData.glow = glow;

    return group;
  }

  /* ----- mobile controls ----- */
  function buildMobileControls(container) {
    const stick = document.createElement("div");
    stick.className = "mobile-stick";
    const knob = document.createElement("div");
    knob.className = "knob";
    stick.appendChild(knob);
    container.appendChild(stick);

    const look = document.createElement("div");
    look.className = "mobile-look";
    container.appendChild(look);

    const action = document.createElement("button");
    action.className = "mobile-action";
    action.textContent = "E";
    container.appendChild(action);

    const state = { x: 0, y: 0, lookX: 0, lookY: 0, action };

    // joystick
    let stickActive = false, stickStart = null;
    stick.addEventListener("touchstart", e => {
      e.preventDefault();
      stickActive = true;
      const t = e.touches[0];
      const r = stick.getBoundingClientRect();
      stickStart = { x: r.left + r.width/2, y: r.top + r.height/2 };
    });
    stick.addEventListener("touchmove", e => {
      e.preventDefault();
      if (!stickActive) return;
      const t = e.touches[0];
      let dx = t.clientX - stickStart.x;
      let dy = t.clientY - stickStart.y;
      const max = 40;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = dx/len * max; dy = dy/len * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      state.x = dx / max; state.y = dy / max;
    });
    stick.addEventListener("touchend", e => {
      e.preventDefault();
      stickActive = false;
      knob.style.transform = "translate(0,0)";
      state.x = 0; state.y = 0;
    });

    // look pad
    let lookLast = null;
    look.addEventListener("touchstart", e => { lookLast = e.touches[0]; });
    look.addEventListener("touchmove", e => {
      const t = e.touches[0];
      if (lookLast) {
        state.lookX = (t.clientX - lookLast.clientX);
        state.lookY = (t.clientY - lookLast.clientY);
      }
      lookLast = t;
    });
    look.addEventListener("touchend", () => { lookLast = null; });

    return state;
  }

  return { init };
})();
