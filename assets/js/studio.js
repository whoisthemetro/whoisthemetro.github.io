/* ============================================================
   METRO — 3D MUSIC STUDIO (walk-in)

   - Roland TD-style electronic drum kit (triangular pads, brain, kick pedal)
   - Synth with slanted LCD + clickable controls (presets, FX, octave)
   - Direct click to play (no overlays)
   - MIDI input flashes the same visuals
   - Multiplayer: partner appears as an avatar; their hits play locally
   ============================================================ */

window.METRO_STUDIO = (function () {
  const ROOM = { w: 24, d: 20, h: 5.5 };
  const EYE_H = 1.65;
  const WALK_SPEED = 4.2;
  const TURN_SPEED = 0.0025;
  const INTERACT_RANGE = 5.0;

  function init() {
    const container = document.getElementById("scene-studio");
    container.innerHTML = "";
    container.classList.add("scene-3d");

    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "ENTERING STUDIO…";
    container.appendChild(loading);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.Fog(0x06080d, 12, 36);

    const camera = new THREE.PerspectiveCamera(
      72, container.clientWidth / container.clientHeight, 0.1, 200
    );
    camera.rotation.order = "YXZ";
    camera.position.set(0, EYE_H, ROOM.d/2 - 2.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    buildRoom(scene);
    addLighting(scene);

    // Catalogs the studio gives back to the dispatcher for visual flashes.
    const drumPads = {};   // name → { flash() }
    const keyMeshes = {};  // midi → { flash() }

    const interactables = [];
    const wallScreen = addWallScreen(scene, interactables);
    addMixingDesk(scene, interactables);
    addMicBooth(scene, interactables);
    const synthScreen = addSynth(scene, interactables, keyMeshes);
    addRolandDrums(scene, interactables, drumPads);

    // Remote player avatar (hidden until connected)
    const remoteAvatar = buildRemoteAvatar(scene);

    requestAnimationFrame(() => loading.classList.add("hidden"));

    // HUD
    const hud = document.createElement("div");
    hud.className = "scene-hud";
    hud.innerHTML = `
      <div class="exit-hint">ESC → BACK TO LOBBY</div>
      <div class="crosshair"></div>
      <div class="prompt" id="studio-prompt">CLICK TO PLAY</div>
      <div class="controls">
        <div>MOVE <span>WASD</span></div>
        <div>LOOK <span>MOUSE</span></div>
        <div>PLAY <span>CLICK</span></div>
        <div>MIDI <span>AUTO</span></div>
        <div>JAM <span>TOP-RIGHT</span></div>
        <div>BACK <span>ESC</span></div>
      </div>
    `;
    container.appendChild(hud);

    const isMobile = matchMedia("(max-width: 720px)").matches;
    let mobile = null;
    if (isMobile) mobile = buildMobileControls(container);

    // ----- INPUT -----
    const keys = {};
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
      return document.querySelector("#musicfull.show, #videoplayer.show, #photomodal.show, #mp-panel.show");
    }
    function onKeyDown(e) {
      if (!running) return;
      if (e.target.matches("input, textarea")) return;
      if (overlayOpen()) return;
      keys[e.code] = true;
    }
    function onKeyUp(e) { if (overlayOpen()) return; keys[e.code] = false; }
    function onMouseMove(e) {
      if (!pointerLocked) return;
      yaw   -= e.movementX * TURN_SPEED;
      pitch -= e.movementY * TURN_SPEED;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    }
    // Track held interactable across mousedown/mouseup so we can release
    // sustaining notes when the mouse button comes back up.
    let heldInteractable = null;

    function onCanvasMouseDown(e) {
      if (e.button !== 0) return;
      if (!pointerLocked) { renderer.domElement.requestPointerLock?.(); return; }
      if (!hovered) return;
      heldInteractable = hovered;
      if (hovered.beginHold) hovered.beginHold();
      else hovered.action();
      if (hovered.onHit) hovered.onHit();
    }
    function onMouseUp(e) {
      if (e.button !== 0) return;
      if (heldInteractable && heldInteractable.endHold) heldInteractable.endHold();
      heldInteractable = null;
    }
    function onPointerLockChange() {
      pointerLocked = document.pointerLockElement === renderer.domElement;
    }
    renderer.domElement.addEventListener("mousedown", onCanvasMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    // If pointer lock is lost while holding, release the note
    document.addEventListener("pointerlockchange", () => {
      onPointerLockChange();
      if (!pointerLocked && heldInteractable && heldInteractable.endHold) {
        heldInteractable.endHold();
        heldInteractable = null;
      }
    });
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Touch: tap starts hold, lift ends hold. Raycast from tap point.
    renderer.domElement.addEventListener("touchstart", (e) => {
      if (e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const r = renderer.domElement.getBoundingClientRect();
      const nx =  ((t.clientX - r.left) / r.width)  * 2 - 1;
      const ny = -((t.clientY - r.top)  / r.height) * 2 + 1;
      raycaster.setFromCamera({ x: nx, y: ny }, camera);
      const hit = findInteractableHit(raycaster);
      if (!hit) return;
      hovered = hit;
      heldInteractable = hit;
      if (hit.beginHold) hit.beginHold();
      else hit.action();
      if (hit.onHit) hit.onHit();
    }, { passive: true });
    renderer.domElement.addEventListener("touchend", (e) => {
      if (heldInteractable && heldInteractable.endHold) heldInteractable.endHold();
      heldInteractable = null;
    }, { passive: true });

    function onResize() {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener("resize", onResize);

    const raycaster = new THREE.Raycaster();
    let hovered = null;
    const promptEl = hud.querySelector("#studio-prompt");
    const interactableMeshes = interactables.map(i => i.mesh);

    function findInteractableHit(rc) {
      const hits = rc.intersectObjects(interactableMeshes, true);
      if (!hits.length) return null;
      if (hits[0].distance > INTERACT_RANGE) return null;
      let n = hits[0].object;
      while (n) {
        const found = interactables.find(i => i.mesh === n);
        if (found) return found;
        n = n.parent;
      }
      return null;
    }
    function tryInteract() {
      if (!hovered) return;
      hovered.action();
      if (hovered.onHit) hovered.onHit();
    }

    // ----- DISPATCH SUBSCRIPTIONS -----
    // When ANY trigger happens (local click / MIDI / remote partner), flash the visual.
    const A = window.METRO_AUDIO;
    A.onDrum(({ name, origin }) => {
      drumPads[name]?.flash(origin);
      if (origin === "local") {
        window.METRO_MP?.isConnected() && window.METRO_MP.sendDrum(name, 100);
      }
    });
    A.onNote(({ midi, velocity, origin }) => {
      keyMeshes[midi]?.flashOn(origin);
      synthScreen.repaint();
      if (origin === "local") {
        window.METRO_MP?.isConnected() && window.METRO_MP.sendNoteOn(midi, velocity);
      }
    });
    A.onNoteOff(({ midi, origin }) => {
      keyMeshes[midi]?.flashOff();
      if (origin === "local") {
        window.METRO_MP?.isConnected() && window.METRO_MP.sendNoteOff(midi);
      }
    });

    // ----- WALL SCREEN PAINT -----
    const screenCtx = wallScreen.canvasCtx;
    const screenTex = wallScreen.canvasTex;
    let screenT = 0;
    function paintWallScreen() {
      const ctx2 = screenCtx;
      const W = ctx2.canvas.width, H = ctx2.canvas.height;
      ctx2.fillStyle = "#05060a"; ctx2.fillRect(0, 0, W, H);
      ctx2.fillStyle = "#00ffd0"; ctx2.fillRect(0, 0, W, 6);
      ctx2.font = "bold 22px monospace"; ctx2.fillStyle = "#00ffd0";
      ctx2.fillText("NOW PLAYING", 24, 50);
      const cur = window.METRO_PLAYER.current();
      ctx2.font = "bold 60px monospace"; ctx2.fillStyle = "#e8ecff";
      ctx2.fillText(cur ? cur.title : "—", 24, 130);
      ctx2.font = "20px monospace"; ctx2.fillStyle = "#8a93b8";
      ctx2.fillText(cur ? cur.artist.toUpperCase() : "METRO", 24, 165);
      const a = window.METRO_PLAYER.audio;
      const pct = a.duration ? a.currentTime / a.duration : 0;
      ctx2.fillStyle = "#11141d"; ctx2.fillRect(24, 200, W - 48, 14);
      ctx2.fillStyle = "#00ffd0"; ctx2.fillRect(24, 200, (W - 48) * pct, 14);
      ctx2.fillStyle = "#00ffd0";
      const bars = 36;
      for (let i = 0; i < bars; i++) {
        const phase = screenT * 4 + i * 0.4;
        const amp = window.METRO_PLAYER.isPlaying() ? (Math.sin(phase) * 0.5 + 0.5) * 0.8 + 0.1 : 0.08;
        const bw = (W - 48) / bars - 2;
        const bh = amp * 80;
        ctx2.globalAlpha = 0.85;
        ctx2.fillRect(24 + i * (bw + 2), 320 - bh, bw, bh);
      }
      ctx2.globalAlpha = 1;
      ctx2.font = "16px monospace"; ctx2.fillStyle = "#ff2bd6";
      ctx2.fillText("CLICK SCREEN TO OPEN PLAYER", 24, 380);
      screenTex.needsUpdate = true;
    }

    // ----- LOOP -----
    const clock = new THREE.Clock();
    let running = true;
    let raf;
    let lastPoseSend = 0;
    const _fwd = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);

    function loop() {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      screenT += dt;

      if (mobile && (mobile.lookX || mobile.lookY)) {
        yaw   -= mobile.lookX * 0.01;
        pitch -= mobile.lookY * 0.01;
        pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
        mobile.lookX = 0; mobile.lookY = 0;
      }
      applyLook();

      let forward = 0, strafe = 0;
      if (keys.KeyW || keys.ArrowUp)    forward += 1;
      if (keys.KeyS || keys.ArrowDown)  forward -= 1;
      if (keys.KeyA || keys.ArrowLeft)  strafe  -= 1;
      if (keys.KeyD || keys.ArrowRight) strafe  += 1;
      if (mobile) { strafe += mobile.x; forward -= mobile.y; }
      if (forward || strafe) {
        const len = Math.hypot(forward, strafe);
        forward /= len; strafe /= len;
        camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
        _right.crossVectors(_fwd, _up).normalize();
        const step = WALK_SPEED * dt;
        camera.position.addScaledVector(_fwd,   forward * step);
        camera.position.addScaledVector(_right, strafe  * step);
      }
      const m = 0.45;
      camera.position.x = Math.max(-ROOM.w/2 + m, Math.min(ROOM.w/2 - m, camera.position.x));
      camera.position.z = Math.max(-ROOM.d/2 + m, Math.min(ROOM.d/2 - m, camera.position.z));
      camera.position.y = EYE_H;

      camera.getWorldDirection(_fwd);
      raycaster.set(camera.position, _fwd.clone());
      const newHover = findInteractableHit(raycaster);
      if (newHover !== hovered) {
        if (hovered && hovered.setHover) hovered.setHover(false);
        hovered = newHover;
        if (hovered) {
          if (hovered.setHover) hovered.setHover(true);
          promptEl.textContent = hovered.label;
          promptEl.classList.add("show");
        } else {
          promptEl.classList.remove("show");
        }
      }

      interactables.forEach(it => { if (it.tick) it.tick(dt); });

      // MULTIPLAYER: send pose, update remote avatar
      const MP = window.METRO_MP;
      if (MP && MP.isConnected()) {
        lastPoseSend += dt;
        if (lastPoseSend > 0.1) {
          MP.sendPose(camera.position.x, camera.position.z, yaw);
          lastPoseSend = 0;
        }
        const rp = MP.remotePose();
        if (rp.valid) {
          remoteAvatar.visible = true;
          remoteAvatar.position.x += (rp.x - remoteAvatar.position.x) * Math.min(1, dt * 12);
          remoteAvatar.position.z += (rp.z - remoteAvatar.position.z) * Math.min(1, dt * 12);
          remoteAvatar.rotation.y += (rp.yaw - remoteAvatar.rotation.y) * Math.min(1, dt * 10);
        } else {
          remoteAvatar.visible = false;
        }
      } else {
        remoteAvatar.visible = false;
      }

      paintWallScreen();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }

    if (mobile) mobile.action.addEventListener("click", () => tryInteract());

    loop();

    return {
      start() {
        running = true;
        clock.start();
        if (!raf) loop();
      },
      stop() {
        running = false;
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        cancelAnimationFrame(raf); raf = null;
      },
    };
  }

  /* ============================================================
     ROOM
     ============================================================ */
  function buildRoom(scene) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      new THREE.MeshStandardMaterial({ color: 0x0a0c14, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI/2; scene.add(floor);

    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 7),
      new THREE.MeshStandardMaterial({ color: 0x1a0c20, roughness: 1 })
    );
    rug.rotation.x = -Math.PI/2; rug.position.set(0, 0.01, 1); scene.add(rug);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      new THREE.MeshStandardMaterial({ color: 0x06080d, roughness: 0.9 })
    );
    ceil.rotation.x = Math.PI/2; ceil.position.y = ROOM.h; scene.add(ceil);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0e1118, roughness: 0.85, side: THREE.DoubleSide });
    function wall(w, h, x, y, z, ry) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      mesh.position.set(x, y, z); mesh.rotation.y = ry; scene.add(mesh);
    }
    wall(ROOM.w, ROOM.h, 0, ROOM.h/2, -ROOM.d/2, 0);
    wall(ROOM.w, ROOM.h, 0, ROOM.h/2,  ROOM.d/2, Math.PI);
    wall(ROOM.d, ROOM.h,  ROOM.w/2, ROOM.h/2, 0, -Math.PI/2);
    wall(ROOM.d, ROOM.h, -ROOM.w/2, ROOM.h/2, 0,  Math.PI/2);

    addAcousticPanels(scene, "north");
    addAcousticPanels(scene, "south");

    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.55 });
    function trim(w, x, z, ry) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.04), trimMat);
      t.position.set(x, 0.06, z); t.rotation.y = ry; scene.add(t);
    }
    trim(ROOM.w, 0, -ROOM.d/2 + 0.05, 0);
    trim(ROOM.w, 0,  ROOM.d/2 - 0.05, 0);
    trim(ROOM.d,  ROOM.w/2 - 0.05, 0, Math.PI/2);
    trim(ROOM.d, -ROOM.w/2 + 0.05, 0, Math.PI/2);
  }
  function addAcousticPanels(scene, side) {
    const z = side === "north" ? -ROOM.d/2 + 0.06 : ROOM.d/2 - 0.06;
    const ry = side === "north" ? 0 : Math.PI;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x141826, roughness: 0.95 });
    const wedgeGeo = new THREE.ConeGeometry(0.18, 0.18, 4);
    const cols = 12, rows = 5;
    const startX = -((cols - 1) * 0.42) / 2;
    const startY = 0.8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const w = new THREE.Mesh(wedgeGeo, panelMat);
        w.position.set(startX + c * 0.42, startY + r * 0.42, z + (ry === 0 ? 0.1 : -0.1));
        w.rotation.z = Math.PI/4;
        w.rotation.x = ry === 0 ? Math.PI/2 : -Math.PI/2;
        scene.add(w);
      }
    }
  }
  function addLighting(scene) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    scene.add(new THREE.HemisphereLight(0x5a4a80, 0x05060a, 0.45));
    const a = new THREE.PointLight(0x00ffd0, 0.8, 14, 1.5); a.position.set(-7, ROOM.h - 0.5, -4); scene.add(a);
    const b = new THREE.PointLight(0xff2bd6, 0.8, 14, 1.5); b.position.set(7, ROOM.h - 0.5, -4); scene.add(b);
    const c = new THREE.PointLight(0xffae00, 0.5, 10, 1.5); c.position.set(0, ROOM.h - 0.5, 5); scene.add(c);
    const k1 = new THREE.SpotLight(0xffffff, 1.2, 14, Math.PI/4.5, 0.4, 1.5);
    k1.position.set(-5, ROOM.h - 0.4, -1.5); k1.target.position.set(-5, 0, -1.5);
    scene.add(k1); scene.add(k1.target);
    const k2 = new THREE.SpotLight(0xffffff, 1.1, 12, Math.PI/5, 0.4, 1.5);
    k2.position.set(0, ROOM.h - 0.4, -0.5); k2.target.position.set(0, 0, -0.5);
    scene.add(k2); scene.add(k2.target);
  }

  /* ============================================================
     WALL SCREEN
     ============================================================ */
  function addWallScreen(scene, interactables) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 3.6, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.5, metalness: 0.4 })
    );
    frame.position.set(0, 2.6, -ROOM.d/2 + 0.12); scene.add(frame);

    const cnv = document.createElement("canvas");
    cnv.width = 1024; cnv.height = 520;
    const ctx2 = cnv.getContext("2d");
    const tex = new THREE.CanvasTexture(cnv);
    tex.encoding = THREE.sRGBEncoding;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(6.0, 3.2),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    );
    screen.position.set(0, 2.6, -ROOM.d/2 + 0.22); scene.add(screen);

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 4.4),
      new THREE.MeshBasicMaterial({
        color: 0x00ffd0, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    halo.position.set(0, 2.6, -ROOM.d/2 + 0.05); scene.add(halo);

    interactables.push({
      mesh: screen,
      label: "OPEN PLAYER",
      action: () => {
        if (document.pointerLockElement) document.exitPointerLock();
        window.METRO_PLAYER.openFull();
      },
      setHover: (on) => { halo.material.opacity = on ? 0.32 : 0.18; },
    });
    return { canvasCtx: ctx2, canvasTex: tex };
  }

  /* ============================================================
     MIXING DESK
     ============================================================ */
  function addMixingDesk(scene, interactables) {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 1.2), deskMat);
    body.position.set(0, 0.9, -5); scene.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.0), deskMat.clone());
    top.position.set(0, 1.35, -4.65); top.rotation.x = -0.35; scene.add(top);
    for (let i = 0; i < 8; i++) {
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2bd6 : 0x00ffd0 })
      );
      knob.rotation.x = -0.35;
      knob.position.set(-1.4 + i * 0.4, 1.4, -4.7);
      scene.add(knob);
    }
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.5, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x00ffd0 })
      );
      f.position.set(-1.0 + i * 0.4, 0.95, -5.3); scene.add(f);
    }
    const playMat = new THREE.MeshStandardMaterial({
      color: 0x00ffd0, emissive: 0x004a3d, emissiveIntensity: 0.6, roughness: 0.35,
    });
    const playBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 32), playMat);
    playBtn.rotation.x = Math.PI/2 - 0.35;
    playBtn.position.set(1.3, 1.42, -4.7); scene.add(playBtn);

    interactables.push({
      mesh: playBtn,
      label: "PLAY / PAUSE",
      action: () => window.METRO_PLAYER.toggle(),
      setHover: (on) => { playMat.emissiveIntensity = on ? 1.4 : 0.6; },
      onHit: () => {
        playMat.color.setHex(0xffffff);
        setTimeout(() => playMat.color.setHex(0x00ffd0), 120);
      },
    });
  }

  /* ============================================================
     MIC BOOTH
     ============================================================ */
  function addMicBooth(scene, interactables) {
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x202229, roughness: 0.4, metalness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.06, 24), baseMat);
    base.position.set(7.5, 0.03, -2); scene.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 12), baseMat);
    pole.position.set(7.5, 0.83, -2); scene.add(pole);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.012, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x303440, metalness: 0.7, roughness: 0.3 })
    );
    ring.position.set(7.5, 1.7, -2); ring.rotation.x = Math.PI/2; scene.add(ring);
    const mic = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.28, 16),
      new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.6, roughness: 0.4 })
    );
    mic.position.set(7.5, 1.7, -2); scene.add(mic);
    const pf = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 24),
      new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
      })
    );
    pf.position.set(7.0, 1.7, -2); pf.rotation.y = Math.PI/2; scene.add(pf);
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.95 })
    );
    shield.position.set(8.4, 1.6, -2); scene.add(shield);
    interactables.push({
      mesh: mic, label: "VOCAL BOOTH",
      action: () => window.METRO_TOAST("Studio booth — coming soon"),
      setHover: () => {},
    });
  }

  /* ============================================================
     ROLAND-STYLE ELECTRONIC DRUM KIT
     ============================================================ */
  function addRolandDrums(scene, interactables, drumPads) {
    const A = window.METRO_AUDIO;
    const KX = -5.5, KY = 0, KZ = -1.6;

    // ---------- RACK ----------
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.6, roughness: 0.45 });

    function tube(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rackMat);
      t.position.set(KX + x, KY + y, KZ + z);
      t.rotation.set(rx, ry, rz);
      scene.add(t);
      return t;
    }
    function postCyl(r, h, x, y, z, rx = 0, rz = 0) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), rackMat);
      m.position.set(KX + x, KY + y, KZ + z);
      m.rotation.set(rx, 0, rz);
      scene.add(m);
      return m;
    }

    // 2 vertical posts (back)
    postCyl(0.04, 1.85, -1.4, 0.93, -0.4);
    postCyl(0.04, 1.85,  1.4, 0.93, -0.4);
    // top horizontal cross bar
    postCyl(0.04, 2.85,  0.0, 1.78, -0.4, 0, Math.PI/2);
    // mid horizontal cross bar (where snare/floor tom hang)
    postCyl(0.04, 2.85,  0.0, 0.95, -0.4, 0, Math.PI/2);
    // bottom stabilizer
    postCyl(0.04, 2.85,  0.0, 0.05, -0.4, 0, Math.PI/2);
    // forward extension arms (snare + floor tom mounts) reaching toward player
    postCyl(0.04, 0.85, -0.85, 0.95, 0.0, Math.PI/2);
    postCyl(0.04, 0.85,  0.85, 0.95, 0.0, Math.PI/2);
    // upper mounting arms for back-row pads (tom1, tom2)
    postCyl(0.04, 0.55, -0.7, 1.35, -0.25, Math.PI/2);
    postCyl(0.04, 0.55,  0.7, 1.35, -0.25, Math.PI/2);
    // cymbal mounting arms (rising from top bar)
    postCyl(0.04, 0.55, -1.15, 1.95, -0.4);
    postCyl(0.04, 0.55,  0.0, 2.05, -0.4);
    postCyl(0.04, 0.55,  1.15, 1.95, -0.4);

    // rack feet
    const footGeo = new THREE.BoxGeometry(0.55, 0.05, 0.18);
    function foot(x, z) {
      const f = new THREE.Mesh(footGeo, rackMat);
      f.position.set(KX + x, 0.025, KZ + z);
      scene.add(f);
    }
    foot(-1.4, -0.4); foot(1.4, -0.4);
    foot(-1.4,  0.05); foot(1.4,  0.05);

    // black clamps where pads meet rack arms (visual detail)
    const clampMat = new THREE.MeshStandardMaterial({ color: 0x05050a, metalness: 0.5, roughness: 0.5 });
    function clamp(x, y, z) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), clampMat);
      c.position.set(KX + x, KY + y, KZ + z); scene.add(c);
    }
    clamp(-0.85, 1.35, -0.25); clamp(0.85, 1.35, -0.25);
    clamp(-1.15, 1.85, -0.4);  clamp(0.0, 1.95, -0.4); clamp(1.15, 1.85, -0.4);
    clamp(-0.85, 0.95, 0.05);  clamp(0.85, 0.95, 0.05);

    // ---------- PAD FACTORY ----------
    function makeRolandPad(w, h, accent) {
      const group = new THREE.Group();

      // Pentagonal "house" shape — wider at bottom, pointed top
      const hw = w / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-hw,            -h * 0.50);
      shape.lineTo( hw,            -h * 0.50);
      shape.lineTo( hw * 0.92,      h * 0.20);
      shape.lineTo( 0.0,            h * 0.50);
      shape.lineTo(-hw * 0.92,      h * 0.20);
      shape.closePath();

      const shellMat = new THREE.MeshStandardMaterial({
        color: 0x1d1f24, roughness: 0.65, metalness: 0.15,
      });
      const shellGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.075, bevelEnabled: true,
        bevelSegments: 2, bevelSize: 0.012, bevelThickness: 0.012,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.position.z = -0.075; // flat face at z=0
      group.add(shell);

      // Rubber playing surface — pentagon, slightly inset
      const rShape = new THREE.Shape();
      const rw = hw - 0.025;
      const rh = h - 0.05;
      rShape.moveTo(-rw,            -rh * 0.50);
      rShape.lineTo( rw,            -rh * 0.50);
      rShape.lineTo( rw * 0.92,      rh * 0.20);
      rShape.lineTo( 0.0,            rh * 0.48);
      rShape.lineTo(-rw * 0.92,      rh * 0.20);
      rShape.closePath();
      const rubberMat = new THREE.MeshStandardMaterial({
        color: 0x2b2d33, roughness: 0.95, metalness: 0.0,
      });
      const rubber = new THREE.Mesh(new THREE.ShapeGeometry(rShape), rubberMat);
      rubber.position.z = 0.004;
      group.add(rubber);

      // Orange/yellow ID stripe at bottom (Roland-y detail)
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xb86a18 });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.012, 0.005), stripeMat);
      stripe.position.set(0, -h * 0.46, 0.006);
      group.add(stripe);

      // Halo behind for flash
      const haloMat = new THREE.MeshBasicMaterial({
        color: accent, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.6), haloMat);
      halo.position.set(0, 0, -0.08);
      group.add(halo);

      group.userData.halo = halo;
      group.userData.shell = shell;
      group.userData.rubber = rubber;
      return group;
    }

    // ---------- PAD LAYOUT ----------
    // Inspired by the photo: lower row of 2 pads (snare, floor tom),
    // back row of 2 mounted pads (tom1, tom2), upper row of 3 (hihat, openhat, clap).
    // Plus kick on the floor with pedal.
    const pads = [
      { name: "snare",   label: "SNARE",   w: 0.50, h: 0.50, accent: 0xffae00, x: -0.85, y: 0.92, z:  0.30, tilt: -0.55 },
      { name: "tom3",    label: "FLOOR TOM", w: 0.50, h: 0.50, accent: 0xff2bd6, x:  0.85, y: 0.92, z:  0.30, tilt: -0.55 },
      { name: "tom1",    label: "TOM 1",   w: 0.42, h: 0.42, accent: 0xff2bd6, x: -0.70, y: 1.38, z: -0.05, tilt: -0.75, yaw: 0.15 },
      { name: "tom2",    label: "TOM 2",   w: 0.42, h: 0.42, accent: 0xff2bd6, x:  0.70, y: 1.38, z: -0.05, tilt: -0.75, yaw: -0.15 },
      { name: "hihat",   label: "HI-HAT",  w: 0.40, h: 0.40, accent: 0xc8a557, x: -1.15, y: 2.00, z: -0.10, tilt: -0.95, yaw: 0.35 },
      { name: "openhat", label: "CRASH",   w: 0.46, h: 0.46, accent: 0xc8a557, x:  0.00, y: 2.18, z: -0.30, tilt: -1.05 },
      { name: "clap",    label: "RIDE",    w: 0.40, h: 0.40, accent: 0xc8a557, x:  1.15, y: 2.00, z: -0.10, tilt: -0.95, yaw: -0.35 },
    ];

    pads.forEach(p => {
      const pad = makeRolandPad(p.w, p.h, p.accent);
      pad.position.set(KX + p.x, KY + p.y, KZ + p.z);
      pad.rotation.x = p.tilt;
      if (p.yaw) pad.rotation.y = p.yaw;
      scene.add(pad);

      let pulse = 0, hov = false;
      const restY = pad.position.y;
      const item = {
        mesh: pad, label: p.label,
        action: () => A.drums.play(p.name),
        setHover: (on) => { hov = on; },
        onHit: () => { pulse = 1.0; },
        tick: (dt) => {
          if (pulse > 0) pulse = Math.max(0, pulse - dt * 5);
          pad.position.y = restY - 0.018 * pulse;
          pad.userData.halo.material.opacity = Math.max(pulse * 0.85, hov ? 0.35 : 0);
        },
      };
      interactables.push(item);
      drumPads[p.name] = { flash: () => { pulse = 1.0; } };
    });

    // ---------- KICK PAD + PEDAL ----------
    // square flat pad on the floor
    const kickPad = new THREE.Group();
    const kickShellGeo = new THREE.BoxGeometry(0.55, 0.08, 0.55);
    const kickShell = new THREE.Mesh(kickShellGeo,
      new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7, metalness: 0.15 }));
    kickPad.add(kickShell);
    const kickRubber = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.02, 0.48),
      new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.95 })
    );
    kickRubber.position.y = 0.05;
    kickPad.add(kickRubber);
    // halo
    const kickHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    kickHalo.rotation.x = -Math.PI/2;
    kickHalo.position.y = 0.005;
    kickPad.add(kickHalo);
    kickPad.position.set(KX + 0.0, KY + 0.04, KZ + 0.85);
    scene.add(kickPad);

    // beater + footboard
    const footboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.04, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x14171f, metalness: 0.5, roughness: 0.5 })
    );
    footboard.position.set(KX + 0.0, KY + 0.04, KZ + 1.35);
    scene.add(footboard);
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.3, 12),
      rackMat
    );
    hinge.rotation.z = Math.PI/2;
    hinge.position.set(KX + 0.0, KY + 0.08, KZ + 1.12);
    scene.add(hinge);
    const beaterShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8),
      rackMat
    );
    beaterShaft.position.set(KX + 0.0, KY + 0.30, KZ + 1.05);
    beaterShaft.rotation.x = -0.4;
    scene.add(beaterShaft);
    const beaterHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xe2cba0, roughness: 0.5 })
    );
    beaterHead.position.set(KX + 0.0, KY + 0.50, KZ + 0.92);
    scene.add(beaterHead);

    {
      let pulse = 0, hov = false;
      const restY = kickPad.position.y;
      const restBeaterY = beaterHead.position.y;
      interactables.push({
        mesh: kickPad, label: "KICK",
        action: () => A.drums.play("kick"),
        setHover: (on) => { hov = on; },
        onHit: () => { pulse = 1.0; },
        tick: (dt) => {
          if (pulse > 0) pulse = Math.max(0, pulse - dt * 5);
          kickPad.position.y = restY - 0.015 * pulse;
          beaterHead.position.y = restBeaterY - 0.10 * pulse;
          kickHalo.material.opacity = Math.max(pulse * 0.85, hov ? 0.3 : 0);
        },
      });
      drumPads.kick = { flash: () => { pulse = 1.0; } };
    }

    // amp box on side (decorative)
    const amp = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.6 })
    );
    amp.position.set(KX + 2.2, KY + 0.45, KZ - 0.3);
    scene.add(amp);
    const ampGrille = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.55, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.9 })
    );
    ampGrille.position.set(KX + 2.2, KY + 0.45, KZ + 0.02);
    scene.add(ampGrille);

    // stool
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.30, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1010, roughness: 0.6 })
    );
    stool.position.set(KX, 0.90, KZ + 1.7);
    scene.add(stool);
    const stoolLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.85, 12),
      rackMat
    );
    stoolLeg.position.set(KX, 0.45, KZ + 1.7);
    scene.add(stoolLeg);
  }

  /* ============================================================
     SYNTH — slanted screen + clickable controls + clickable keys
     ============================================================ */
  function addSynth(scene, interactables, keyMeshes) {
    const A = window.METRO_AUDIO;

    // Anchor (synth center, keyboard rests at this position).
    const KX = 0, KY = 1.0, KZ = -0.6;

    const standMat = new THREE.MeshStandardMaterial({ color: 0x0f1218, roughness: 0.55 });
    const synthMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.55, metalness: 0.25 });

    // ----- STAND -----
    const stand = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.9), standMat);
    stand.position.set(KX, KY, KZ); scene.add(stand);
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, KY, 0.1), standMat);
    leg1.position.set(KX - 1.4, KY/2, KZ); scene.add(leg1);
    const leg2 = leg1.clone(); leg2.position.x = KX + 1.4; scene.add(leg2);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.04, 0.04), standMat);
    cross.position.set(KX, 0.4, KZ); scene.add(cross);

    // ----- BODY (keybed) -----
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.66), synthMat);
    body.position.set(KX, KY + 0.14, KZ); scene.add(body);

    // ----- BACK PANEL (vertical control surface that faces the player) -----
    // Rises behind the keybed at chest-to-face height. Slight backward lean
    // keeps it ergonomic without obscuring the screen at a standing distance.
    const panel = new THREE.Group();
    panel.position.set(KX, KY + 0.55, KZ - 0.30);  // chest height, behind keys
    panel.rotation.x = -Math.PI / 18;              // ~10° lean back at the top
    scene.add(panel);

    // Panel slab — wide, ~60cm tall, thin in depth. Faces +Z (toward player).
    const panelBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.62, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.4, metalness: 0.4 })
    );
    panel.add(panelBody);

    // Two support struts going down to the keybed for visual support
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.5 });
    function strut(x) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.30, 0.04), strutMat);
      s.position.set(x, -0.31 - 0.15, 0); // dangle below the back panel
      panel.add(s);
    }
    strut(-1.45); strut(1.45);

    // ----- LCD (faces +Z, player-facing) -----
    const scnv = document.createElement("canvas");
    scnv.width = 720; scnv.height = 240;
    const sctx = scnv.getContext("2d");
    const stex = new THREE.CanvasTexture(scnv);
    stex.encoding = THREE.sRGBEncoding;

    const lcd = new THREE.Mesh(
      new THREE.PlaneGeometry(1.50, 0.36),
      new THREE.MeshBasicMaterial({ map: stex, toneMapped: false })
    );
    lcd.position.set(0, 0.12, 0.025);  // upper half of panel, just in front of slab
    panel.add(lcd);

    // LCD bezel (raised border around the screen)
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(1.58, 0.42, 0.018),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.6 })
    );
    bezel.position.set(0, 0.12, 0.014);
    panel.add(bezel);

    function paintLcd() {
      const W = sctx.canvas.width, H = sctx.canvas.height;
      sctx.fillStyle = "#0a1416"; sctx.fillRect(0, 0, W, H);
      // scanline grid
      sctx.strokeStyle = "#0e2628"; sctx.lineWidth = 1;
      for (let x = 0; x < W; x += 20) { sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, H); sctx.stroke(); }
      for (let y = 0; y < H; y += 20) { sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(W, y); sctx.stroke(); }
      const p = A.synth.currentPreset();
      // header
      sctx.fillStyle = "#00ffd0"; sctx.font = "bold 22px monospace";
      sctx.fillText("METRO SYNTH", 24, 38);
      // preset name (huge)
      sctx.fillStyle = "#9cffe6"; sctx.font = "bold 88px monospace";
      sctx.fillText(p.name, 24, 122);
      // wave + octave
      sctx.fillStyle = "#9cffe6"; sctx.font = "26px monospace";
      sctx.fillText("WAVE: " + p.wave.toUpperCase(), 24, 168);
      sctx.fillText("OCT: " + A.synth.state.octave, 320, 168);
      // FX badges
      const fx = A.synth.state.fx;
      const badges = [["DLY", fx.delay, "#00ffd0"], ["REV", fx.reverb, "#ff2bd6"], ["DST", fx.distortion, "#ffae00"]];
      let bx = 24;
      badges.forEach(([t, on, color]) => {
        sctx.fillStyle = on ? color : "#152024";
        sctx.fillRect(bx, 188, 90, 38);
        sctx.fillStyle = on ? "#001512" : "#3a4a4a";
        sctx.font = "bold 24px monospace";
        sctx.fillText(t, bx + 22, 215);
        bx += 100;
      });
      stex.needsUpdate = true;
    }
    paintLcd();

    // ----- PANEL CONTROL BUTTONS -----
    // Each button is a thin box mounted on the panel front face.
    // Click depresses it (pushes -Z into panel).
    function panelButton(label, color, w, h, x, y, action, getOn) {
      const offMat = new THREE.MeshStandardMaterial({
        color: 0x1a1d24, emissive: color, emissiveIntensity: 0.0, roughness: 0.5,
      });
      const onMat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6, roughness: 0.45,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), offMat);
      mesh.position.set(x, y, 0.030);
      panel.add(mesh);

      // label as a plane in front of button face, facing +Z (player-facing)
      const lcnv = document.createElement("canvas");
      lcnv.width = 256; lcnv.height = 64;
      const lc = lcnv.getContext("2d");
      lc.fillStyle = "rgba(0,0,0,0)"; lc.fillRect(0, 0, 256, 64);
      lc.fillStyle = "#e8f4ff"; lc.font = "bold 36px monospace";
      lc.textAlign = "center"; lc.textBaseline = "middle";
      lc.fillText(label, 128, 32);
      const ltex = new THREE.CanvasTexture(lcnv);
      ltex.encoding = THREE.sRGBEncoding;
      const lblMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 1.1, h * 0.7),
        new THREE.MeshBasicMaterial({ map: ltex, transparent: true, toneMapped: false })
      );
      lblMesh.position.set(x, y, 0.050);  // just in front of the button face
      panel.add(lblMesh);

      let hov = false, hit = 0;
      const item = {
        mesh, label,
        action: () => { action(); paintLcd(); refreshOn(); },
        setHover: (on) => { hov = on; refreshOn(); },
        onHit: () => { hit = 1.0; },
        tick: (dt) => {
          if (hit > 0) hit = Math.max(0, hit - dt * 6);
          mesh.position.z = 0.030 - 0.010 * hit;
        },
      };
      function refreshOn() {
        const isOn = !!getOn?.();
        mesh.material = isOn ? onMat : offMat;
        mesh.material.emissiveIntensity = isOn ? 0.7 : (hov ? 0.35 : 0.0);
      }
      refreshOn();
      interactables.push(item);
      return { mesh, refresh: refreshOn };
    }

    // Button row below the LCD (panel-local y = -0.20)
    const BTN_Y = -0.20;
    // PRESET prev / next (far left)
    panelButton("◀", 0x00ffd0, 0.13, 0.13, -1.45, BTN_Y, () => A.synth.prevPreset());
    panelButton("▶", 0x00ffd0, 0.13, 0.13, -1.28, BTN_Y, () => A.synth.nextPreset());

    // WAVEFORMS
    const waves = [["SAW","sawtooth"], ["SQR","square"], ["SIN","sine"], ["TRI","triangle"]];
    waves.forEach(([lbl, w], i) => {
      panelButton(lbl, 0xff2bd6, 0.19, 0.13, -1.00 + i * 0.22, BTN_Y,
        () => A.synth.setWave(w),
        () => A.synth.currentPreset().wave === w);
    });

    // FX
    panelButton("DLY",  0x00ffd0, 0.21, 0.13, 0.00,  BTN_Y, () => A.synth.toggleFx("delay"),      () => A.synth.state.fx.delay);
    panelButton("REV",  0xff2bd6, 0.21, 0.13, 0.25,  BTN_Y, () => A.synth.toggleFx("reverb"),     () => A.synth.state.fx.reverb);
    panelButton("DST",  0xffae00, 0.21, 0.13, 0.50,  BTN_Y, () => A.synth.toggleFx("distortion"), () => A.synth.state.fx.distortion);

    // OCTAVE (far right)
    panelButton("OCT-", 0xc8a557, 0.21, 0.13, 1.05, BTN_Y, () => A.synth.setOctave(A.synth.state.octave - 1));
    panelButton("OCT+", 0xc8a557, 0.21, 0.13, 1.30, BTN_Y, () => A.synth.setOctave(A.synth.state.octave + 1));

    // brand stripe under the LCD on the right side
    const brand = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.04, 0.005),
      new THREE.MeshBasicMaterial({ color: 0xff2bd6 })
    );
    brand.position.set(1.10, -0.05, 0.024);
    panel.add(brand);

    // ----- KEYBED LED STRIP -----
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.025, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0 })
    );
    led.position.set(KX, KY + 0.225, KZ + 0.32); scene.add(led);

    // ----- KEYS (clickable) -----
    const whiteNotes = ["C","D","E","F","G","A","B","C","D","E","F","G","A","B","C"];
    const whiteOctaves = [4,4,4,4,4,4,4, 5,5,5,5,5,5,5, 6];
    const N = whiteNotes.length;
    const totalWidth = 2.95;
    const kw = totalWidth / N;
    const yTop = KY + 0.23;

    const whiteMatBase = new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 0.4 });
    const blackMatBase = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    function registerKey(mesh, note, octave, isBlack) {
      const restY = mesh.position.y;
      let isHeld = false, pulse = 0, hov = false, origin = "local";
      const matCopy = mesh.material.clone();
      mesh.material = matCopy;
      const baseColor = matCopy.color.clone();
      const midi = noteNameToMidi(note, octave);
      const item = {
        mesh,
        label: `${note}${octave}`,
        // tap = one-shot 0.45s note (used by mobile TAP button)
        action: () => A.synth.playNote(midi, 0.45),
        // hold = sustained while button stays down (mousedown/mouseup, touchstart/touchend)
        beginHold: () => A.synth.noteOn(midi, 100),
        endHold:   () => A.synth.noteOff(midi),
        setHover: (on) => { hov = on; },
        tick: (dt) => {
          if (!isHeld && pulse > 0) pulse = Math.max(0, pulse - dt * 5);
          const depress = isHeld ? 1.0 : pulse;
          mesh.position.y = restY - 0.018 * depress;
          const c = isBlack ? new THREE.Color(0xff2bd6) : new THREE.Color(0x00ffd0);
          if (origin === "midi")   c.set(0xffae00);
          if (origin === "remote") c.set(0xff2bd6);
          const intensity = isHeld ? 0.85 : pulse;
          matCopy.color.lerpColors(baseColor, c, intensity);
          if (matCopy.emissive) matCopy.emissive.set(c).multiplyScalar(intensity * 0.5);
        },
      };
      interactables.push(item);
      keyMeshes[midi] = {
        flashOn:  (o) => { isHeld = true;  pulse = 1.0; origin = o || "local"; },
        flashOff: ()  => { isHeld = false; /* let pulse decay */ },
      };
    }

    // white keys
    for (let i = 0; i < N; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(kw - 0.008, 0.045, 0.5), whiteMatBase);
      w.position.set(KX - totalWidth/2 + kw/2 + i * kw, yTop, KZ + 0.08);
      scene.add(w);
      registerKey(w, whiteNotes[i], whiteOctaves[i], false);
    }
    // black keys
    for (let i = 0; i < N - 1; i++) {
      const n = whiteNotes[i];
      if (n === "E" || n === "B") continue;
      const octave = whiteOctaves[i];
      const bnote = n + "#";
      const bk = new THREE.Mesh(new THREE.BoxGeometry(kw * 0.6, 0.055, 0.32), blackMatBase);
      bk.position.set(KX - totalWidth/2 + kw + i * kw, yTop + 0.012, KZ - 0.02);
      scene.add(bk);
      registerKey(bk, bnote, octave, true);
    }

    return {
      repaint: paintLcd,
    };
  }

  function noteNameToMidi(noteName, octave) {
    const map = { C:0, "C#":1, D:2, "D#":3, E:4, F:5, "F#":6, G:7, "G#":8, A:9, "A#":10, B:11 };
    return map[noteName] + (parseInt(octave) + 1) * 12;
  }

  /* ============================================================
     REMOTE PLAYER AVATAR
     ============================================================ */
  function buildRemoteAvatar(scene) {
    const g = new THREE.Group();
    // body capsule
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x0d4a40, emissive: 0x004a3d, emissiveIntensity: 0.4, roughness: 0.5 })
    );
    body.position.y = 0.85;
    g.add(body);
    // head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.6 })
    );
    head.position.y = 1.55;
    g.add(head);
    // glowing visor
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0 })
    );
    visor.position.set(0, 1.55, 0.20);
    g.add(visor);
    // floating name tag (sprite)
    const tcnv = document.createElement("canvas");
    tcnv.width = 256; tcnv.height = 64;
    const tc = tcnv.getContext("2d");
    tc.fillStyle = "rgba(0,0,0,0.65)"; tc.fillRect(0, 0, 256, 64);
    tc.fillStyle = "#00ffd0"; tc.font = "bold 28px monospace";
    tc.textAlign = "center"; tc.textBaseline = "middle";
    tc.fillText("PARTNER", 128, 32);
    const ttex = new THREE.CanvasTexture(tcnv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ttex, transparent: true }));
    sprite.scale.set(0.8, 0.2, 1);
    sprite.position.y = 2.05;
    g.add(sprite);
    g.visible = false;
    scene.add(g);
    return g;
  }

  /* ============================================================
     MOBILE CONTROLS
     ============================================================ */
  function buildMobileControls(container) {
    const stick = document.createElement("div");
    stick.className = "mobile-stick";
    const knob = document.createElement("div"); knob.className = "knob"; stick.appendChild(knob);
    container.appendChild(stick);
    const look = document.createElement("div"); look.className = "mobile-look";
    container.appendChild(look);
    const action = document.createElement("button"); action.className = "mobile-action"; action.textContent = "TAP";
    container.appendChild(action);
    const state = { x:0, y:0, lookX:0, lookY:0, action };
    let stickActive=false, stickStart=null;
    stick.addEventListener("touchstart", e => {
      e.preventDefault(); stickActive=true;
      const r = stick.getBoundingClientRect();
      stickStart = { x: r.left + r.width/2, y: r.top + r.height/2 };
    });
    stick.addEventListener("touchmove", e => {
      e.preventDefault(); if (!stickActive) return;
      const t = e.touches[0];
      let dx = t.clientX - stickStart.x, dy = t.clientY - stickStart.y;
      const max = 40, len = Math.hypot(dx, dy);
      if (len > max) { dx = dx/len*max; dy = dy/len*max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      state.x = dx/max; state.y = dy/max;
    });
    stick.addEventListener("touchend", e => {
      e.preventDefault(); stickActive=false;
      knob.style.transform = "translate(0,0)"; state.x=0; state.y=0;
    });
    let lookLast = null;
    look.addEventListener("touchstart", e => { lookLast = e.touches[0]; });
    look.addEventListener("touchmove", e => {
      const t = e.touches[0];
      if (lookLast) { state.lookX = t.clientX - lookLast.clientX; state.lookY = t.clientY - lookLast.clientY; }
      lookLast = t;
    });
    look.addEventListener("touchend", () => { lookLast = null; });
    return state;
  }

  return { init };
})();
