/* ============================================================
   METRO — 3D MUSIC STUDIO (real-studio layout)

   - Mixer console in the center: 3 channel strips (DRUMS, SYNTH,
     MUSIC) + master fader, each with HI/MID/LO EQ, AUX1, AUX2,
     mute, solo. Click-and-drag knobs and faders.
   - FX rack on top of the mixer: DELAY (time/feedback/wet),
     REVERB (decay/wet), COMP (threshold/ratio/wet) — parallel
     compressor that adds drum smack.
   - Roland-style electronic drum kit (left), tighter spacing.
   - Drum brain next to the kit: kit preset + dry/wet smack knob.
   - Synth (right) with vertical LCD panel, presets, FX toggles,
     working octave transpose, ladder LPF in audio engine.
   - Wall screen at the back (north wall).
   - No mic stand.
   ============================================================ */

window.METRO_STUDIO = (function () {
  const ROOM = { w: 24, d: 20, h: 5.5 };
  const EYE_H = 1.65;
  const WALK_SPEED = 4.6;
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
    scene.fog = new THREE.Fog(0x06080d, 14, 32);

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

    // Bring up the audio engine eagerly so the MUSIC channel routes through
    // the mixer (so muting on the console actually silences playback).
    window.METRO_AUDIO?.init?.();

    buildRoom(scene);
    addLighting(scene);

    const drumPads = {};   // drum name → { flash() }
    const keyMeshes = {};  // midi → { flashOn, flashOff }
    const interactables = [];

    // AABBs that block the player. Each: { x: [minX, maxX], z: [minZ, maxZ] }.
    // Listed once after scene build so per-axis collision tests stay cheap.
    const OBSTACLES = [
      { x: [-2.0, 2.0],    z: [-1.85, -0.15] }, // mixer (now 1.6m deep, CZ=-1)
      { x: [-7.0, -4.0],   z: [-2.7,  -0.5] },  // drum kit + stool
      { x: [-7.90, -7.30], z: [-0.45, 1.20] },  // SDS drum brain (1.5w × 0.55d, rotated)
      { x: [ 3.5,  7.5],   z: [-1.1,  -0.1] },  // synth (now 4.0m wide w/ wood cheeks)
    ];
    const PLAYER_R = 0.42;
    function blocked(x, z) {
      for (const o of OBSTACLES) {
        if (x > o.x[0] - PLAYER_R && x < o.x[1] + PLAYER_R &&
            z > o.z[0] - PLAYER_R && z < o.z[1] + PLAYER_R) return true;
      }
      return false;
    }

    addMixerConsole(scene, interactables);
    addFxRackOnMixer(scene, interactables);
    addDrumKit(scene, interactables, drumPads);
    const drumBrain = addDrumBrain(scene, interactables);
    const synthCtx = addSynth(scene, interactables, keyMeshes);
    addStudioMonitors(scene);

    const remoteAvatar = buildRemoteAvatar(scene);

    requestAnimationFrame(() => loading.classList.add("hidden"));

    // HUD
    const hud = document.createElement("div");
    hud.className = "scene-hud";
    hud.innerHTML = `
      <div class="exit-hint">ESC → BACK TO LOBBY</div>
      <div class="crosshair"></div>
      <div class="prompt" id="studio-prompt">CLICK TO PLAY</div>
      <div class="latency" id="latency-meter">
        <div><span class="lbl">AUDIO</span> <span id="lat-audio">—</span></div>
        <div><span class="lbl">NET</span>   <span id="lat-net">—</span></div>
        <div class="advice" id="lat-advice"></div>
      </div>
      <div class="controls">
        <div>MOVE <span>WASD</span></div>
        <div>LOOK <span>MOUSE</span></div>
        <div>PLAY/HOLD <span>CLICK</span></div>
        <div>MIX KNOBS <span>CLICK-DRAG</span></div>
        <div>MIDI <span>TOP NAV</span></div>
        <div>JAM <span>TOP NAV</span></div>
        <div>BACK <span>ESC</span></div>
      </div>
    `;
    container.appendChild(hud);

    // Update latency meter every ~500ms (cheap)
    const latAudio  = hud.querySelector("#lat-audio");
    const latNet    = hud.querySelector("#lat-net");
    const latAdvice = hud.querySelector("#lat-advice");
    setInterval(() => {
      const aMs = window.METRO_AUDIO?.outputLatencyMs?.() || 0;
      latAudio.textContent = aMs ? `${aMs} ms` : "—";
      const MP = window.METRO_MP;
      if (MP && MP.isConnected()) {
        const rtt = MP.rttMs();
        latNet.textContent = rtt ? `${rtt} ms` : "…";
      } else {
        latNet.textContent = "OFFLINE";
      }
      // Plain-English hint about what's limiting latency
      let advice = "";
      if (aMs === 0) advice = "click anything to init audio";
      else if (aMs > 120) advice = "BLUETOOTH? switch to wired";
      else if (aMs > 50)  advice = "try wired for tighter feel";
      else if (aMs > 25)  advice = "good for jamming";
      else                advice = "tight ✓";
      latAdvice.textContent = advice;
    }, 500);

    const isMobile = matchMedia("(max-width: 720px)").matches;
    let mobile = null;
    if (isMobile) mobile = buildMobileControls(container);

    // ===== INPUT =====
    const keys = {};
    let yaw = 0, pitch = 0;
    const PITCH_LIMIT = Math.PI / 2 - 0.05;
    let pointerLocked = false;
    let heldInteractable = null;

    function applyLook() {
      camera.rotation.x = pitch;
      camera.rotation.y = yaw;
      camera.rotation.z = 0;
    }
    applyLook();

    function overlayOpen() {
      return document.querySelector("#musicfull.show, #videoplayer.show, #photomodal.show, #mp-panel.show, #midi-panel.show");
    }
    function onKeyDown(e) {
      if (!running) return;
      if (e.target.matches("input, textarea")) return;
      if (overlayOpen()) return;
      // Typing-keyboard piano/drum mode owns the letter keys
      if (window.METRO_MIDI?.typingActive?.()) return;
      keys[e.code] = true;
    }
    function onKeyUp(e) {
      if (overlayOpen()) return;
      if (window.METRO_MIDI?.typingActive?.()) { keys[e.code] = false; return; }
      keys[e.code] = false;
    }
    function onMouseMove(e) {
      if (!pointerLocked) return;
      // While dragging a knob/fader, forward the delta to it instead of rotating camera.
      if (heldInteractable && heldInteractable.onDrag) {
        heldInteractable.onDrag(e.movementX, e.movementY);
        return;
      }
      yaw   -= e.movementX * TURN_SPEED;
      pitch -= e.movementY * TURN_SPEED;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    }
    function onCanvasMouseDown(e) {
      if (e.button !== 0) return;
      if (!pointerLocked) { renderer.domElement.requestPointerLock?.(); return; }
      if (!hovered) return;
      heldInteractable = hovered;
      if (hovered.beginHold) hovered.beginHold();
      else if (hovered.action) hovered.action();
      if (hovered.onHit) hovered.onHit();
    }
    function onMouseUp(e) {
      if (e.button !== 0) return;
      if (heldInteractable && heldInteractable.endHold) heldInteractable.endHold();
      heldInteractable = null;
    }
    function onPointerLockChange() {
      pointerLocked = document.pointerLockElement === renderer.domElement;
      if (!pointerLocked && heldInteractable && heldInteractable.endHold) {
        heldInteractable.endHold();
        heldInteractable = null;
      }
    }
    renderer.domElement.addEventListener("mousedown", onCanvasMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Touch
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
      else if (hit.action) hit.action();
      if (hit.onHit) hit.onHit();
    }, { passive: true });
    renderer.domElement.addEventListener("touchend", () => {
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

    // ===== DISPATCH SUBSCRIPTIONS =====
    const A = window.METRO_AUDIO;
    A.onDrum(({ name, origin }) => {
      drumPads[name]?.flash(origin);
      if (origin === "local") {
        window.METRO_MP?.isConnected() && window.METRO_MP.sendDrum(name, 100);
      }
    });
    A.onNote(({ midi, velocity, origin }) => {
      // local clicks already set their key visual via beginHold (because of octave
      // transpose). Only let dispatcher flash for MIDI / remote events.
      if (origin !== "local") keyMeshes[midi]?.flashOn(origin);
      synthCtx.repaint();
      if (origin === "local") {
        window.METRO_MP?.isConnected() && window.METRO_MP.sendNoteOn(midi, velocity);
      }
    });
    A.onNoteOff(({ midi, origin }) => {
      if (origin !== "local") keyMeshes[midi]?.flashOff();
      if (origin === "local") {
        window.METRO_MP?.isConnected() && window.METRO_MP.sendNoteOff(midi);
      }
    });

    // ===== CLAIM GATE =====
    // Local clicks / touches only fire if I'm allowed to play this instrument.
    // Solo (no MP) is always allowed; in MP, blocked when partner owns it.
    // Exposed on window so the drum/synth helper functions can read it.
    window._metroCanPlay = function (instrument) {
      const MP = window.METRO_MP;
      if (!MP || !MP.isConnected()) return true;
      return MP.claimAvailable(instrument);
    };

    // ===== LOOP =====
    const clock = new THREE.Clock();
    let running = true;
    let raf;
    let lastPoseSend = 0;
    let screenT = 0;
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
        const dx = (_fwd.x * forward + _right.x * strafe) * step;
        const dz = (_fwd.z * forward + _right.z * strafe) * step;
        // Per-axis collision so the player slides along obstacles instead of
        // getting stuck on a corner.
        const tx = camera.position.x + dx;
        const tz = camera.position.z + dz;
        if (!blocked(tx, camera.position.z)) camera.position.x = tx;
        if (!blocked(camera.position.x, tz)) camera.position.z = tz;
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
      drumBrain.tick(dt);

      // MULTIPLAYER
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

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    if (mobile) mobile.action.addEventListener("click", () => {
      if (!hovered) return;
      if (hovered.action) hovered.action();
      else if (hovered.beginHold) { hovered.beginHold(); setTimeout(() => hovered.endHold?.(), 400); }
      if (hovered.onHit) hovered.onHit();
    });

    loop();
    return {
      start() { running = true; clock.start(); if (!raf) loop(); },
      stop()  { running = false; if (document.pointerLockElement === renderer.domElement) document.exitPointerLock(); cancelAnimationFrame(raf); raf = null; },
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
      new THREE.PlaneGeometry(10, 7),
      new THREE.MeshStandardMaterial({ color: 0x1a0c20, roughness: 1 })
    );
    rug.rotation.x = -Math.PI/2; rug.position.set(0, 0.01, 0.5); scene.add(rug);

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

    // baseboard glow
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
    const cols = 14, rows = 5;
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
    // overhead spot on mixer
    const mix = new THREE.SpotLight(0xffffff, 1.4, 10, Math.PI/4.5, 0.45, 1.5);
    mix.position.set(0, ROOM.h - 0.4, -1); mix.target.position.set(0, 0.8, -1);
    scene.add(mix); scene.add(mix.target);
    // spots over drums + synth
    const kd = new THREE.SpotLight(0xffffff, 1.0, 9, Math.PI/4.5, 0.4, 1.5);
    kd.position.set(-5.5, ROOM.h - 0.4, -1.5); kd.target.position.set(-5.5, 0, -1.5);
    scene.add(kd); scene.add(kd.target);
    const ks = new THREE.SpotLight(0xffffff, 1.0, 9, Math.PI/4.5, 0.4, 1.5);
    ks.position.set(5.5, ROOM.h - 0.4, -1.5); ks.target.position.set(5.5, 0, -1.5);
    scene.add(ks); scene.add(ks.target);
  }

  /* ============================================================
     STUDIO MONITORS (decorative speakers next to wall screen)
     ============================================================ */
  function addStudioMonitors(scene) {
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.55 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.9 });
    function monitor(x) {
      // stand
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.18, 1.0, 14), cabMat);
      stand.position.set(x, 0.5, -ROOM.d/2 + 1.2); scene.add(stand);
      // base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.30, 0.04, 14), cabMat);
      base.position.set(x, 0.02, -ROOM.d/2 + 1.2); scene.add(base);
      // cabinet
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.42), cabMat);
      cab.position.set(x, 1.30, -ROOM.d/2 + 1.2); scene.add(cab);
      // woofer
      const wf = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18), coneMat);
      wf.position.set(x, 1.18, -ROOM.d/2 + 1.0); scene.add(wf);
      // tweeter
      const tw = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), coneMat);
      tw.position.set(x, 1.46, -ROOM.d/2 + 1.0); scene.add(tw);
      // logo glow
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.005),
        new THREE.MeshBasicMaterial({ color: 0x00ffd0 }));
      glow.position.set(x, 1.04, -ROOM.d/2 + 1.0); scene.add(glow);
    }
    monitor(-4.2); monitor(4.2);
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
      new THREE.MeshBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.position.set(0, 2.6, -ROOM.d/2 + 0.05); scene.add(halo);

    interactables.push({
      mesh: screen, label: "OPEN PLAYER",
      action: () => { if (document.pointerLockElement) document.exitPointerLock(); window.METRO_PLAYER.openFull(); },
      setHover: (on) => { halo.material.opacity = on ? 0.32 : 0.18; },
    });
    return { canvasCtx: ctx2, canvasTex: tex };
  }

  /* ============================================================
     GENERIC CONTROLS (knob, fader, toggle)
     ============================================================ */
  function makeLabel(text, w, h, color = "#cfe7ff", size = 36) {
    const cnv = document.createElement("canvas");
    cnv.width = 256; cnv.height = 64;
    const c = cnv.getContext("2d");
    c.fillStyle = "rgba(0,0,0,0)"; c.fillRect(0, 0, 256, 64);
    c.fillStyle = color; c.font = `bold ${size}px monospace`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(cnv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
    );
  }

  // Knob on a horizontal surface (axis vertical, dial faces up).
  // Drag HORIZONTAL: right = clockwise (increase), left = counter-clockwise.
  function makeKnob({ label, color = 0x00ffd0, x, y, z, min, max, get, set, parent, sensitivity = 200 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.055, 0.016, 16),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.6 })
    );
    group.add(base);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.046, 0.034, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.45, metalness: 0.3 })
    );
    cap.position.y = 0.022;
    group.add(cap);
    const dot = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, 0.005, 0.030),
      new THREE.MeshBasicMaterial({ color })
    );
    dot.position.set(0, 0.017, -0.022);
    cap.add(dot);

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.10, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = 0.04;
    group.add(hit);

    if (label) {
      const lbl = makeLabel(label, 0.13, 0.034, "#cfe7ff", 32);
      lbl.position.set(0, 0.001, 0.090);
      lbl.rotation.x = -Math.PI/2;
      group.add(lbl);
    }
    parent.add(group);

    let value = get();
    function applyRotation() {
      const t = (value - min) / (max - min);
      const angle = (t - 0.5) * (Math.PI * 1.5);
      cap.rotation.y = -angle;
    }
    applyRotation();

    const item = {
      mesh: hit, label,
      beginHold: () => {},
      endHold: () => {},
      onDrag: (dx, dy) => {
        const range = max - min;
        // Horizontal drag = turn the knob. Right is clockwise = increase.
        value = Math.max(min, Math.min(max, value + (dx / sensitivity) * range));
        set(value);
        applyRotation();
      },
      setHover: () => {},
    };
    return { group, item, refresh: () => { value = get(); applyRotation(); } };
  }

  // Fader: horizontal mounting, thumb slides along Z axis (front-back)
  function makeFader({ label, color = 0x00ffd0, x, y, z, length = 0.32, min, max, get, set, parent, sensitivity = 220 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const track = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.008, length),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.5 })
    );
    group.add(track);
    const thumb = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.042, 0.055),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.45 })
    );
    thumb.position.y = 0.022;
    group.add(thumb);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.06, length),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = 0.03;
    group.add(hit);

    if (label) {
      const lbl = makeLabel(label, 0.30, 0.045, "#cfe7ff", 30);
      lbl.position.set(0, 0.005, length/2 + 0.07);
      lbl.rotation.x = -Math.PI/2;
      group.add(lbl);
    }
    parent.add(group);

    let value = get();
    function applyPosition() {
      const t = (value - min) / (max - min);
      // Higher value → thumb pushed AWAY from player (more -Z),
      // matching console convention "push the fader up to bring it up".
      thumb.position.z = length/2 - t * length;
    }
    applyPosition();

    const item = {
      mesh: hit, label,
      beginHold: () => {},
      endHold: () => {},
      onDrag: (dx, dy) => {
        const range = max - min;
        value = Math.max(min, Math.min(max, value + (-dy / sensitivity) * range));
        set(value);
        applyPosition();
      },
      setHover: () => {},
    };
    return { group, item, refresh: () => { value = get(); applyPosition(); } };
  }

  function makeToggle({ label, color, x, y, z, get, set, parent, w = 0.075, d = 0.075 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const offMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, emissive: color, emissiveIntensity: 0.0, roughness: 0.5 });
    const onMat  = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, d), offMat);
    mesh.position.y = 0.011;
    group.add(mesh);

    if (label) {
      const lbl = makeLabel(label, 0.10, 0.028, "#cfe7ff", 38);
      lbl.position.set(0, 0.024, 0);
      lbl.rotation.x = -Math.PI/2;
      group.add(lbl);
    }
    parent.add(group);

    function refresh() {
      const on = !!get();
      mesh.material = on ? onMat : offMat;
    }
    refresh();
    const item = {
      mesh, label,
      action: () => { set(!get()); refresh(); },
      setHover: () => {},
    };
    return { group, item, refresh };
  }

  function makeMomentary({ label, color, x, y, z, action, parent, w = 0.10, d = 0.06 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, d), mat);
    mesh.position.y = 0.011;
    group.add(mesh);
    if (label) {
      const lbl = makeLabel(label, w * 1.4, 0.032, "#cfe7ff", 38);
      lbl.position.set(0, 0.024, 0);
      lbl.rotation.x = -Math.PI/2;
      group.add(lbl);
    }
    parent.add(group);

    let hit = 0;
    const item = {
      mesh, label,
      action: () => { action(); hit = 1.0; },
      setHover: () => {},
      tick: (dt) => {
        if (hit > 0) { hit = Math.max(0, hit - dt * 6); mesh.position.y = 0.011 - 0.008 * hit; }
      },
    };
    return { group, item };
  }

  /* ============================================================
     MIXER CONSOLE
     ============================================================ */
  function addMixerConsole(scene, interactables) {
    const A = window.METRO_AUDIO;
    const CX = 0, CY = 0, CZ = -1;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.55, metalness: 0.3 });
    const topMat  = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.4 });

    // body (table) — deeper to accommodate FX rack at the back without
    // crowding the EQ knobs
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.85, 1.6), bodyMat);
    body.position.set(CX, CY + 0.425, CZ); scene.add(body);
    const top  = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.04, 1.6), topMat);
    top.position.set(CX, CY + 0.87, CZ); scene.add(top);
    [[-1.85, -0.75], [1.85, -0.75], [-1.85, 0.75], [1.85, 0.75]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.08), bodyMat);
      leg.position.set(CX + lx, CY + 0.425, CZ + lz);
      scene.add(leg);
    });

    // Surface group: controls in mixer-top local coords (y is height above surface)
    const surface = new THREE.Group();
    surface.position.set(CX, CY + 0.89, CZ);
    scene.add(surface);

    // 3 channel strips
    const strips = ["drums", "synth", "music"];
    const stripX = [-1.5, -0.7, 0.1];
    strips.forEach((name, i) => addChannelStrip(interactables, surface, name, stripX[i]));
    // Master strip
    addMasterStrip(interactables, surface, 1.3);

    // Channel name placards along the front edge of the mixer
    strips.forEach((name, i) => {
      const lbl = makeLabel(name.toUpperCase(), 0.5, 0.07, "#00ffd0", 38);
      lbl.position.set(stripX[i], CY + 0.45, CZ + 0.72);
      scene.add(lbl);
    });
    const m = makeLabel("MASTER", 0.6, 0.07, "#ff2bd6", 38);
    m.position.set(1.3, CY + 0.45, CZ + 0.72); scene.add(m);
  }

  function addChannelStrip(interactables, surface, chName, sx) {
    const A = window.METRO_AUDIO;
    // EQ stack (HI/MID/LO) — three knobs along Z at the back of the strip
    const k = (label, color, z, key, min, max) => {
      const c = makeKnob({
        label, color, x: sx, y: 0, z, min, max, parent: surface,
        get: () => A.mixer.get(chName, key),
        set: (v) => A.mixer.set(chName, key, v),
      });
      interactables.push(c.item);
    };
    const teal = 0x00ffd0;
    const pink = 0xff2bd6;
    const amber = 0xffae00;
    const red = 0xff4040;

    k("HI",  teal,  -0.50, "eqHigh", -15, 15);
    k("MID", teal,  -0.30, "eqMid",  -15, 15);
    k("LO",  teal,  -0.10, "eqLow",  -15, 15);

    // Aux sends
    const ax1 = makeKnob({ label: "AX1", color: amber, x: sx - 0.10, y: 0, z: 0.08,
      min: 0, max: 1, parent: surface,
      get: () => A.mixer.get(chName, "aux1"), set: v => A.mixer.set(chName, "aux1", v) });
    const ax2 = makeKnob({ label: "AX2", color: pink,  x: sx + 0.10, y: 0, z: 0.08,
      min: 0, max: 1, parent: surface,
      get: () => A.mixer.get(chName, "aux2"), set: v => A.mixer.set(chName, "aux2", v) });
    interactables.push(ax1.item, ax2.item);

    // Mute / Solo
    const mute = makeToggle({ label: "M", color: red, x: sx - 0.10, y: 0, z: 0.24, parent: surface,
      get: () => A.mixer.get(chName, "mute"),  set: v => A.mixer.set(chName, "mute", v) });
    const solo = makeToggle({ label: "S", color: amber, x: sx + 0.10, y: 0, z: 0.24, parent: surface,
      get: () => A.mixer.get(chName, "solo"),  set: v => A.mixer.set(chName, "solo", v) });
    interactables.push(mute.item, solo.item);

    // Fader
    const f = makeFader({ color: teal, x: sx, y: 0, z: 0.50, length: 0.30,
      min: 0, max: 1.5, parent: surface,
      get: () => A.mixer.get(chName, "volume"), set: v => A.mixer.set(chName, "volume", v) });
    interactables.push(f.item);
  }

  function addMasterStrip(interactables, surface, sx) {
    const A = window.METRO_AUDIO;
    const f = makeFader({ color: 0xff2bd6, x: sx, y: 0, z: 0.40, length: 0.50,
      min: 0, max: 1.5, parent: surface,
      get: () => A.mixer.getMaster(), set: v => A.mixer.masterVolume(v) });
    interactables.push(f.item);
  }

  /* ============================================================
     FX RACK on the mixer
     ============================================================ */
  function addFxRackOnMixer(scene, interactables) {
    const A = window.METRO_AUDIO;
    const CX = 0, CY = 0.89, CZ = -1; // sitting on mixer surface

    // rack body (vertical panel rising up from the back of the mixer).
    // Pushed back enough that its leaned-forward bottom edge clears the EQ knobs.
    const rackTilt = -Math.PI / 12; // 15° lean back
    const rack = new THREE.Group();
    rack.position.set(CX, CY + 0.42, CZ - 0.95);
    rack.rotation.x = rackTilt;
    scene.add(rack);

    const rackBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.85, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.45, metalness: 0.4 })
    );
    rack.add(rackBody);

    // 3 units
    // Delay/Reverb are 100% wet — control the FX amount via the mixer's
    // per-channel AUX 1 (delay) / AUX 2 (reverb) sends instead.
    addRackUnit(interactables, rack, 0.30, "DELAY", 0x00ffd0, [
      { label: "TIME", x: -1.30, min: 0.01, max: 1.5, get: () => A.fx.delay.params().time,     set: v => A.fx.delay.set("time", v) },
      { label: "FB",   x: -1.00, min: 0,    max: 0.9, get: () => A.fx.delay.params().feedback, set: v => A.fx.delay.set("feedback", v) },
    ]);
    addRackUnit(interactables, rack, 0.0, "REVERB", 0xff2bd6, [
      { label: "DECAY", x: -1.30, min: 0.4, max: 6.0, get: () => A.fx.reverb.params().decay, set: v => A.fx.reverb.set("decay", v) },
    ]);
    addRackUnit(interactables, rack, -0.30, "COMP", 0xffae00, [
      { label: "THR",  x: -1.30, min: -60, max: 0,  get: () => A.fx.comp.params().threshold, set: v => A.fx.comp.set("threshold", v) },
      { label: "RTO",  x: -1.00, min: 1,   max: 20, get: () => A.fx.comp.params().ratio,     set: v => A.fx.comp.set("ratio", v) },
      { label: "WET",  x: -0.70, min: 0,   max: 1,  get: () => A.fx.comp.params().wet,       set: v => A.fx.comp.set("wet", v) },
    ]);
  }
  function addRackUnit(interactables, rack, yPos, title, color, knobDefs) {
    // unit panel
    const unit = new THREE.Group();
    unit.position.set(0, yPos, 0.03);
    rack.add(unit);

    const bg = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.25, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.5 })
    );
    unit.add(bg);

    // title
    const tl = makeLabel(title, 0.5, 0.07, "#cfe7ff", 38);
    tl.position.set(-1.50, 0, 0.014);
    unit.add(tl);

    // small "LED" by title
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.012),
      new THREE.MeshBasicMaterial({ color })
    );
    led.position.set(-1.70, 0, 0.014);
    unit.add(led);

    // knobs (face +Z on the vertical rack panel)
    knobDefs.forEach(k => addRackKnob(interactables, unit, k, color));
  }
  function addRackKnob(interactables, parent, k, defaultColor) {
    const kg = new THREE.Group();
    kg.position.set(k.x, 0, 0.022);
    parent.add(kg);

    // Match the mixer EQ knob style: same cap dimensions, same line-shaped
    // indicator. The cap is rotated so its axis points OUT toward the player
    // (+Z), and the dot is a thin radial line that sweeps like a clock hand
    // when cap.rotation.z is animated.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.055, 0.016, 16),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.6 })
    );
    base.rotation.x = Math.PI/2;
    kg.add(base);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.046, 0.034, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.45, metalness: 0.3 })
    );
    cap.rotation.x = Math.PI/2;
    cap.position.z = 0.017;
    kg.add(cap);
    // Thin radial indicator (same geometry as EQ knob: 5×5×30mm). cap is
    // rotated R_x(π/2) — cap-local Y maps to world -Z, cap-local Z to world Y.
    // Placing the line geometry on cap-local Z axis means it becomes radial in
    // world Y direction — i.e. points UP from cap center when cap.rotation.z=0.
    const dot = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, 0.005, 0.030),
      new THREE.MeshBasicMaterial({ color: defaultColor })
    );
    dot.position.set(0, 0.014, -0.022);
    cap.add(dot);

    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.x = Math.PI/2;
    kg.add(hit);

    const lbl = makeLabel(k.label, 0.16, 0.038, "#cfe7ff", 32);
    lbl.position.set(0, -0.085, 0.025);
    kg.add(lbl);

    let value = k.get();
    function applyRot() {
      const t = (value - k.min) / (k.max - k.min);
      const angle = (t - 0.5) * (Math.PI * 1.5);
      cap.rotation.z = -angle;
    }
    applyRot();

    interactables.push({
      mesh: hit, label: k.label,
      beginHold: () => {},
      endHold:   () => {},
      onDrag: (dx, dy) => {
        const range = k.max - k.min;
        // Horizontal drag — same as mixer knobs (right = increase / CW)
        value = Math.max(k.min, Math.min(k.max, value + (dx / 200) * range));
        k.set(value);
        applyRot();
      },
      setHover: () => {},
    });
  }

  /* ============================================================
     DRUM KIT (Roland-style, tighter)
     ============================================================ */
  function addDrumKit(scene, interactables, drumPads) {
    const A = window.METRO_AUDIO;
    const KX = -5.5, KY = 0, KZ = -1.5;

    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.6, roughness: 0.45 });
    function postCyl(r, h, x, y, z, rx = 0, rz = 0) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), rackMat);
      m.position.set(KX + x, KY + y, KZ + z);
      m.rotation.set(rx, 0, rz);
      scene.add(m);
    }
    // posts
    postCyl(0.04, 1.85, -1.0, 0.93, -0.4);
    postCyl(0.04, 1.85,  1.0, 0.93, -0.4);
    // crossbars
    postCyl(0.04, 2.05, 0, 1.75, -0.4, 0, Math.PI/2);
    postCyl(0.04, 2.05, 0, 0.95, -0.4, 0, Math.PI/2);
    postCyl(0.04, 2.05, 0, 0.05, -0.4, 0, Math.PI/2);
    // forward arms
    postCyl(0.04, 0.75, -0.65, 0.95,  0.0, Math.PI/2);
    postCyl(0.04, 0.75,  0.65, 0.95,  0.0, Math.PI/2);
    // upper arms
    postCyl(0.04, 0.50, -0.55, 1.32, -0.25, Math.PI/2);
    postCyl(0.04, 0.50,  0.55, 1.32, -0.25, Math.PI/2);
    // cymbal arms
    postCyl(0.04, 0.55, -0.85, 1.95, -0.4);
    postCyl(0.04, 0.55,  0.0,  2.05, -0.4);
    postCyl(0.04, 0.55,  0.85, 1.95, -0.4);

    // feet
    const footGeo = new THREE.BoxGeometry(0.50, 0.05, 0.18);
    [[-1.0, -0.4], [1.0, -0.4], [-1.0, 0.05], [1.0, 0.05]].forEach(([x, z]) => {
      const f = new THREE.Mesh(footGeo, rackMat);
      f.position.set(KX + x, 0.025, KZ + z);
      scene.add(f);
    });

    // clamps
    const clampMat = new THREE.MeshStandardMaterial({ color: 0x05050a, metalness: 0.5, roughness: 0.5 });
    function clamp(x, y, z) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), clampMat);
      c.position.set(KX + x, KY + y, KZ + z); scene.add(c);
    }
    clamp(-0.55, 1.32, -0.25); clamp(0.55, 1.32, -0.25);
    clamp(-0.85, 1.85, -0.4);  clamp(0.0,  1.95, -0.4); clamp(0.85, 1.85, -0.4);
    clamp(-0.65, 0.95,  0.05); clamp(0.65, 0.95,  0.05);

    // Pad factory (same pentagonal Roland shape)
    function makeRolandPad(w, h, accent) {
      const group = new THREE.Group();
      const hw = w / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-hw, -h * 0.50);
      shape.lineTo( hw, -h * 0.50);
      shape.lineTo( hw * 0.92,  h * 0.20);
      shape.lineTo( 0.0,        h * 0.50);
      shape.lineTo(-hw * 0.92,  h * 0.20);
      shape.closePath();
      const shellMat = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.65, metalness: 0.15 });
      const shellGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.012, bevelThickness: 0.012 });
      const shell = new THREE.Mesh(shellGeo, shellMat); shell.position.z = -0.075;
      group.add(shell);
      const rShape = new THREE.Shape();
      const rw = hw - 0.025, rh = h - 0.05;
      rShape.moveTo(-rw, -rh * 0.50); rShape.lineTo(rw, -rh * 0.50);
      rShape.lineTo(rw * 0.92, rh * 0.20); rShape.lineTo(0.0, rh * 0.48);
      rShape.lineTo(-rw * 0.92, rh * 0.20); rShape.closePath();
      const rubberMat = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.95 });
      const rubber = new THREE.Mesh(new THREE.ShapeGeometry(rShape), rubberMat);
      rubber.position.z = 0.004;
      group.add(rubber);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.012, 0.005),
        new THREE.MeshBasicMaterial({ color: 0xb86a18 }));
      stripe.position.set(0, -h * 0.46, 0.006);
      group.add(stripe);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.6),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.set(0, 0, -0.08);
      group.add(halo);
      group.userData.halo = halo;
      return group;
    }

    // Tighter pad spacing than before (multiplied x positions by ~0.65)
    const pads = [
      { name: "snare",   label: "SNARE",     w: 0.46, h: 0.46, accent: 0xffae00, x: -0.55, y: 0.92, z:  0.30, tilt: -0.55 },
      { name: "tom3",    label: "FLOOR TOM", w: 0.46, h: 0.46, accent: 0xff2bd6, x:  0.55, y: 0.92, z:  0.30, tilt: -0.55 },
      { name: "tom1",    label: "TOM 1",     w: 0.40, h: 0.40, accent: 0xff2bd6, x: -0.50, y: 1.38, z: -0.05, tilt: -0.75, yaw: 0.18 },
      { name: "tom2",    label: "TOM 2",     w: 0.40, h: 0.40, accent: 0xff2bd6, x:  0.50, y: 1.38, z: -0.05, tilt: -0.75, yaw: -0.18 },
      { name: "hihat",   label: "HI-HAT",    w: 0.38, h: 0.38, accent: 0xc8a557, x: -0.85, y: 2.00, z: -0.10, tilt: -0.95, yaw: 0.35 },
      { name: "openhat", label: "CRASH",     w: 0.42, h: 0.42, accent: 0xc8a557, x:  0.00, y: 2.18, z: -0.30, tilt: -1.05 },
      { name: "clap",    label: "RIDE",      w: 0.38, h: 0.38, accent: 0xc8a557, x:  0.85, y: 2.00, z: -0.10, tilt: -0.95, yaw: -0.35 },
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
        action: () => { if (window._metroCanPlay("drums")) A.drums.play(p.name); },
        setHover: (on) => { hov = on; },
        onHit:   () => { pulse = 1.0; },
        tick: (dt) => {
          if (pulse > 0) pulse = Math.max(0, pulse - dt * 5);
          pad.position.y = restY - 0.018 * pulse;
          pad.userData.halo.material.opacity = Math.max(pulse * 0.85, hov ? 0.35 : 0);
        },
      };
      interactables.push(item);
      drumPads[p.name] = { flash: () => { pulse = 1.0; } };
    });

    // KICK + pedal
    const kickPad = new THREE.Group();
    const kickShell = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 0.50),
      new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7, metalness: 0.15 }));
    kickPad.add(kickShell);
    const kickRubber = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.95 }));
    kickRubber.position.y = 0.05;
    kickPad.add(kickRubber);
    const kickHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    kickHalo.rotation.x = -Math.PI/2;
    kickHalo.position.y = 0.005;
    kickPad.add(kickHalo);
    kickPad.position.set(KX, KY + 0.04, KZ + 0.85);
    scene.add(kickPad);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x14171f, metalness: 0.5, roughness: 0.5 }));
    footboard.position.set(KX, KY + 0.04, KZ + 1.35); scene.add(footboard);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 12), rackMat);
    hinge.rotation.z = Math.PI/2; hinge.position.set(KX, KY + 0.08, KZ + 1.12); scene.add(hinge);
    const beaterShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), rackMat);
    beaterShaft.position.set(KX, KY + 0.30, KZ + 1.05); beaterShaft.rotation.x = -0.4;
    scene.add(beaterShaft);
    const beaterHead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xe2cba0, roughness: 0.5 }));
    beaterHead.position.set(KX, KY + 0.50, KZ + 0.92); scene.add(beaterHead);

    {
      let pulse = 0, hov = false;
      const restY = kickPad.position.y;
      const restBeaterY = beaterHead.position.y;
      interactables.push({
        mesh: kickPad, label: "KICK",
        action: () => { if (window._metroCanPlay("drums")) A.drums.play("kick"); },
        setHover: (on) => { hov = on; },
        onHit:   () => { pulse = 1.0; },
        tick: (dt) => {
          if (pulse > 0) pulse = Math.max(0, pulse - dt * 5);
          kickPad.position.y = restY - 0.015 * pulse;
          beaterHead.position.y = restBeaterY - 0.10 * pulse;
          kickHalo.material.opacity = Math.max(pulse * 0.85, hov ? 0.3 : 0);
        },
      });
      drumPads.kick = { flash: () => { pulse = 1.0; } };
    }

    // stool
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1010, roughness: 0.6 }));
    stool.position.set(KX, 0.90, KZ + 1.7); scene.add(stool);
    const stoolLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 12), rackMat);
    stoolLeg.position.set(KX, 0.45, KZ + 1.7); scene.add(stoolLeg);
  }

  /* ============================================================
     DRUM BRAIN — minimal patch switcher to the drummer's left.
     Drummer sits at world (KX_drums, *, KZ_drums + throne offset) facing -Z.
     Their LEFT is -X. We place the brain west of the throne and rotate it
     +90° around Y so the LCD + buttons face +X (toward the drummer).
     Volume + smack live on the mixer / FX rack — this is just for fast
     patch (kit) switching while playing.
     ============================================================ */
  /* ============================================================
     SDS-style DRUM BRAIN — full Simmons SDS-400 vibe.
     Sits to the drummer's LEFT, faces the drummer (+X world).
     Per-drum LEVEL / TUNE / DECAY knobs across 8 channel strips.
     LCD on the left, KIT + CLAIM + MASTER on the right.
     ============================================================ */
  function addDrumBrain(scene, interactables) {
    const A = window.METRO_AUDIO;
    const BX = -7.6, BY = 0, BZ = 0.4;

    // World-rotation: brain LOCAL +Z faces world +X (toward drummer)
    const brain = new THREE.Group();
    brain.position.set(BX, BY, BZ);
    brain.rotation.y = Math.PI / 2;
    scene.add(brain);

    // ----- BODY -----
    // Brain dimensions in LOCAL frame (X = drummer's left-right width,
    // Y = vertical, Z = depth from drummer's POV)
    const W = 1.50, H = 0.12, D = 0.55;
    const STAND_H = 0.70;
    const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.55, metalness: 0.3 });
    const topMat   = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.45 });
    const accentMat = new THREE.MeshBasicMaterial({ color: 0xff6a18 }); // Simmons orange

    // top slab (the brain itself)
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat);
    body.position.set(0, STAND_H + H/2, 0);
    brain.add(body);

    // top surface inset (sits clearly above the body to avoid z-fighting)
    const top = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.005, D - 0.02), topMat);
    top.position.set(0, STAND_H + H + 0.005, 0);
    brain.add(top);

    // front-edge orange Simmons accent stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W, 0.012, 0.004), accentMat);
    stripe.position.set(0, STAND_H + 0.008, D/2 - 0.002);
    brain.add(stripe);

    // legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, metalness: 0.6, roughness: 0.4 });
    function leg(x, z) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, STAND_H, 0.05), legMat);
      l.position.set(x, STAND_H/2, z);
      brain.add(l);
    }
    leg(-W/2 + 0.04, -D/2 + 0.04);
    leg( W/2 - 0.04, -D/2 + 0.04);
    leg(-W/2 + 0.04,  D/2 - 0.04);
    leg( W/2 - 0.04,  D/2 - 0.04);

    // ----- LCD (left section of top) -----
    const lcnv = document.createElement("canvas");
    lcnv.width = 420; lcnv.height = 320;
    const lctx = lcnv.getContext("2d");
    const ltex = new THREE.CanvasTexture(lcnv);
    ltex.encoding = THREE.sRGBEncoding;

    // Stack the bezel and LCD ABOVE the top inset (top is at STAND_H + H + 0.005,
    // height 0.005 → top of top-surface is STAND_H + H + 0.0075). Bezel sits
    // above that, then LCD above bezel — no overlap.
    const lcdW = 0.28, lcdD = 0.38;
    const bezelY = STAND_H + H + 0.014;
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(lcdW + 0.025, 0.010, lcdD + 0.025),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.6 })
    );
    bezel.position.set(-W/2 + 0.18, bezelY, 0);
    brain.add(bezel);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(lcdW, lcdD),
      new THREE.MeshBasicMaterial({ map: ltex, toneMapped: false }));
    lcd.rotation.x = -Math.PI/2;
    lcd.position.set(-W/2 + 0.18, bezelY + 0.008, 0);
    brain.add(lcd);

    function paintLcd() {
      lctx.fillStyle = "#0a1416"; lctx.fillRect(0, 0, 420, 320);
      lctx.strokeStyle = "#0e2628"; lctx.lineWidth = 1;
      for (let y = 0; y < 320; y += 14) { lctx.beginPath(); lctx.moveTo(0, y); lctx.lineTo(420, y); lctx.stroke(); }
      // Header
      lctx.fillStyle = "#ff6a18"; lctx.font = "bold 24px monospace";
      lctx.fillText("METRO SDS-1", 18, 38);
      // Kit name
      lctx.fillStyle = "#9cffe6"; lctx.font = "bold 22px monospace";
      lctx.fillText("KIT", 18, 80);
      lctx.fillStyle = "#9cffe6"; lctx.font = "bold 64px monospace";
      lctx.fillText(A.drums.currentKitName(), 18, 142);
      // Claim badge (multiplayer only)
      const MP = window.METRO_MP;
      if (MP && MP.isConnected()) {
        const c = MP.getClaim("drums");
        let bg, txt, text;
        if (c === MP.myRole())  { bg = "#00ffd0"; txt = "#001512"; text = "YOURS"; }
        else if (c)             { bg = "#ff4040"; txt = "#ffffff"; text = "PARTNER"; }
        else                    { bg = "#1a2228"; txt = "#9cffe6"; text = "OPEN"; }
        lctx.fillStyle = bg; lctx.fillRect(18, 168, 384, 40);
        lctx.fillStyle = txt; lctx.font = "bold 24px monospace";
        lctx.fillText(text, 30, 197);
      }
      // Hint
      lctx.fillStyle = "#3a4a4a"; lctx.font = "16px monospace";
      lctx.fillText("LVL / TUNE / DCY PER VOICE", 18, 244);
      lctx.fillText("◀ ▶ KIT     🔒 CLAIM      MASTER →", 18, 278);
      ltex.needsUpdate = true;
    }
    paintLcd();

    // ----- CHANNEL STRIPS (8 drums × 3 knobs) -----
    // Knob colors
    const COL_LEVEL = 0x00ffd0;  // cyan
    const COL_TUNE  = 0xffae00;  // orange
    const COL_DECAY = 0xff2bd6;  // magenta

    // Strip layout — 8 strips between LCD and master section
    const stripNames = [
      ["KICK",    "kick"],
      ["SNARE",   "snare"],
      ["HI-HAT",  "hihat"],
      ["OPEN HH", "openhat"],
      ["TOM 1",   "tom1"],
      ["TOM 2",   "tom2"],
      ["TOM 3",   "tom3"],
      ["CLAP",    "clap"],
    ];
    // Available width for strips: from LCD right edge (-W/2 + 0.18 + lcdW/2 + 0.04) to
    //                            master left edge  ( W/2 - 0.20)
    const stripsStart = -W/2 + 0.18 + lcdW/2 + 0.04; // ≈ -0.43
    const stripsEnd   =  W/2 - 0.20;                  // ≈ +0.55
    const stripW = (stripsEnd - stripsStart) / stripNames.length; // ~0.123
    const yTop = STAND_H + H + 0.005;

    // Section divider lines on top (between strips)
    const dividerMat = new THREE.MeshBasicMaterial({ color: 0x1c1f28 });
    for (let i = 1; i < stripNames.length; i++) {
      const x = stripsStart + i * stripW;
      const ln = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, D - 0.06), dividerMat);
      ln.position.set(x, yTop, 0);
      brain.add(ln);
    }

    // Per-strip LEDs (flash when drum plays) — we replace drumPads with our own
    // visualization too. Listen for drum events via METRO_AUDIO.
    const stripLeds = {};

    stripNames.forEach(([label, name], i) => {
      const sx = stripsStart + stripW * (i + 0.5);

      // LED at the back of the strip
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x1a2228 });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.025), ledMat);
      led.position.set(sx, yTop + 0.002, -D/2 + 0.045);
      brain.add(led);
      stripLeds[name] = { mesh: led, mat: ledMat, pulse: 0 };

      // 3 knobs stacked along Z axis (LEVEL, TUNE, DECAY)
      const k1 = makeKnob({ label: "LVL", color: COL_LEVEL, x: sx, y: yTop, z: -0.13,
        min: 0, max: 2, parent: brain,
        get: () => A.drums.getParam(name, "gain"),
        set: v => A.drums.setParam(name, "gain", v),
      });
      const k2 = makeKnob({ label: "TUN", color: COL_TUNE, x: sx, y: yTop, z: 0.00,
        min: -24, max: 24, parent: brain,
        get: () => A.drums.getParam(name, "tune"),
        set: v => A.drums.setParam(name, "tune", v),
      });
      const k3 = makeKnob({ label: "DCY", color: COL_DECAY, x: sx, y: yTop, z: 0.13,
        min: 0.3, max: 2.5, parent: brain,
        get: () => A.drums.getParam(name, "decay"),
        set: v => A.drums.setParam(name, "decay", v),
      });
      interactables.push(k1.item, k2.item, k3.item);

      // Drum name label at the front
      const lbl = makeLabel(label, 0.13, 0.026, "#cfe7ff", 28);
      lbl.position.set(sx, yTop + 0.003, D/2 - 0.045);
      lbl.rotation.x = -Math.PI/2;
      brain.add(lbl);
    });

    // ----- MASTER SECTION (right side) -----
    const mxBase = W/2 - 0.10;

    // KIT prev/next at the back
    const prev = makeMomentary({ label: "◀", color: 0x00ffd0, x: mxBase, y: yTop, z: -0.18,
      action: () => { A.drums.prevKit(); paintLcd(); }, parent: brain, w: 0.07, d: 0.08 });
    const next = makeMomentary({ label: "▶", color: 0x00ffd0, x: mxBase, y: yTop, z: -0.08,
      action: () => { A.drums.nextKit(); paintLcd(); }, parent: brain, w: 0.07, d: 0.08 });
    interactables.push(prev.item, next.item);

    // CLAIM
    const claimBtn = makeMomentary({ label: "🔒", color: 0xff2bd6, x: mxBase, y: yTop, z: 0.03,
      action: () => {
        const MP = window.METRO_MP;
        if (!MP || !MP.isConnected()) {
          window.METRO_TOAST?.("Start a JAM session to claim instruments");
          return;
        }
        if (MP.iAmOwner("drums")) MP.setClaim("drums", "release");
        else if (MP.claimAvailable("drums")) MP.setClaim("drums", "me");
        else window.METRO_TOAST?.("Drums claimed by partner");
        paintLcd();
      },
      parent: brain, w: 0.09, d: 0.09 });
    interactables.push(claimBtn.item);

    // MASTER (drum-bus volume, mirrors mixer drums fader)
    const master = makeKnob({ label: "MSTR", color: 0xff6a18, x: mxBase, y: yTop, z: 0.18,
      min: 0, max: 1.5, parent: brain,
      get: () => A.mixer.get("drums", "volume"),
      set: v => A.mixer.set("drums", "volume", v) });
    interactables.push(master.item);

    // Repaint LCD when a claim changes
    window.METRO_MP?.onClaims?.(() => paintLcd());

    // Subscribe to drum dispatch to flash LEDs on every hit
    A.onDrum(({ name }) => {
      const s = stripLeds[name];
      if (s) s.pulse = 1.0;
    });

    return {
      tick: (dt) => {
        // Decay LED pulses
        Object.values(stripLeds).forEach(s => {
          if (s.pulse > 0) {
            s.pulse = Math.max(0, s.pulse - dt * 4);
            const c = Math.floor(0x1a + 0xc0 * s.pulse);
            s.mat.color.setRGB((0x1a + 0xc0 * s.pulse)/255, (0x22 + 0xdd * s.pulse)/255, (0x28 + 0xa8 * s.pulse)/255);
          }
        });
      },
      repaint: paintLcd,
    };
  }

  /* ============================================================
     SYNTH (right side) — vertical LCD + controls + clickable keys
     ============================================================ */
  function addSynth(scene, interactables, keyMeshes) {
    const A = window.METRO_AUDIO;
    const KX = 5.5, KY = 1.0, KZ = -0.6;

    // ===== ARP / HOLD state =====
    let arpOn = false, holdOn = false;
    let arpNotes = [];
    let arpIdx = 0;
    let arpInterval = null;
    const ARP_STEP_MS = 130;
    const ARP_NOTE_DUR = 0.18;
    function startArp() {
      if (arpInterval) return;
      arpInterval = setInterval(() => {
        if (!arpNotes.length) { stopArp(); return; }
        const note = arpNotes[arpIdx % arpNotes.length];
        arpIdx++;
        A.synth.playNote(note, ARP_NOTE_DUR);
      }, ARP_STEP_MS);
    }
    function stopArp() {
      if (arpInterval) clearInterval(arpInterval);
      arpInterval = null;
      arpIdx = 0;
    }
    function arpToggleNote(midi) {
      if (arpNotes.includes(midi)) {
        arpNotes = arpNotes.filter(n => n !== midi);
        if (!arpNotes.length) stopArp();
        return false;
      }
      arpNotes.push(midi);
      arpNotes.sort((a, b) => a - b);
      if (!arpInterval) startArp();
      return true;
    }

    // ===== MATERIALS =====
    const woodMat   = new THREE.MeshStandardMaterial({ color: 0x6b3e1a, roughness: 0.7, metalness: 0.05 });
    const woodEnd   = new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.75 });
    const standMat  = new THREE.MeshStandardMaterial({ color: 0x0f1218, roughness: 0.55 });
    const synthMat  = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.55, metalness: 0.25 });

    // ===== STAND =====
    const stand = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.06, 1.0), standMat);
    stand.position.set(KX, KY, KZ); scene.add(stand);
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, KY, 0.1), standMat);
    leg1.position.set(KX - 1.85, KY/2, KZ); scene.add(leg1);
    const leg2 = leg1.clone(); leg2.position.x = KX + 1.85; scene.add(leg2);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.04, 0.04), standMat);
    cross.position.set(KX, 0.4, KZ); scene.add(cross);

    // ===== KEYBED BODY =====
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 0.66), synthMat);
    body.position.set(KX, KY + 0.14, KZ); scene.add(body);

    // (Wood end-cheeks removed — they caused visual overlap with the keybed)

    // ===== BACK PANEL (sloped) =====
    const panel = new THREE.Group();
    panel.position.set(KX, KY + 0.55, KZ - 0.30);
    panel.rotation.x = -Math.PI / 18;
    scene.add(panel);

    const PANEL_W = 3.60;
    const PANEL_H = 0.42;
    const panelBody = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_W, PANEL_H, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x12141a, roughness: 0.5, metalness: 0.3 })
    );
    panel.add(panelBody);

    // ===== STATIC PANEL CANVAS (borders, section titles, knob labels) =====
    const SECTIONS = [
      { id: "osc",  title: "OSCILLATOR",  x: [-1.675, -1.125] },
      { id: "flt",  title: "FILTER",      x: [-1.075, -0.625] },
      { id: "amp",  title: "AMPLIFIER",   x: [-0.575,  0.275] },
      { id: "fx",   title: "FX",          x: [ 0.325,  0.475] },
      { id: "arp",  title: "ARP",         x: [ 0.525,  0.825] },
      { id: "prog", title: "PROGRAMMER",  x: [ 0.875,  1.425] },
      { id: "oct",  title: "OCT",         x: [ 1.475,  1.675] },
    ];

    const pcnv = document.createElement("canvas");
    pcnv.width = 1800; pcnv.height = 210;
    const pctx = pcnv.getContext("2d");
    const ptex = new THREE.CanvasTexture(pcnv);
    ptex.encoding = THREE.sRGBEncoding;
    function panelXToCanvas(px) { return (px + PANEL_W / 2) / PANEL_W * pcnv.width; }

    function paintPanelStatic() {
      const W = pcnv.width, H = pcnv.height;
      pctx.fillStyle = "#15171d"; pctx.fillRect(0, 0, W, H);
      // subtle horizontal grain
      pctx.fillStyle = "rgba(255,255,255,0.015)";
      for (let y = 0; y < H; y += 3) pctx.fillRect(0, y, W, 1);
      // sections
      SECTIONS.forEach(s => {
        const x1 = panelXToCanvas(s.x[0]);
        const x2 = panelXToCanvas(s.x[1]);
        const y1 = H * 0.18, y2 = H * 0.92;
        // border
        pctx.strokeStyle = "rgba(220,220,235,0.55)";
        pctx.lineWidth = 1.6;
        pctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        // title
        pctx.fillStyle = "#cfe7ff";
        pctx.font = "600 18px JetBrains Mono, monospace";
        pctx.textAlign = "center";
        pctx.fillText(s.title, (x1 + x2) / 2, y1 - 8);
      });
      ptex.needsUpdate = true;
    }
    paintPanelStatic();

    // Apply panel art as an emissive overlay plane on top of the panel body.
    const panelArt = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_W, PANEL_H),
      new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false })
    );
    panelArt.position.set(0, 0, 0.026);
    panel.add(panelArt);

    // ===== KNOBS (uniform style, all on panel) =====
    // Position knobs at panel-local y just below the section titles
    const KNOB_Y = -0.03;

    // OSC: 4 wave-shape toggle buttons
    const waves = [["SAW","sawtooth"], ["SQR","square"], ["SIN","sine"], ["TRI","triangle"]];
    const oscStart = -1.625, oscEnd = -1.175;
    const oscStep = (oscEnd - oscStart) / 3;
    waves.forEach(([lbl, w], i) => {
      const x = oscStart + i * oscStep;
      panelButton(lbl, 0xff2bd6, 0.085, 0.085, x, KNOB_Y - 0.04,
        () => A.synth.setParam("wave", w),
        () => A.synth.getParam("wave") === w);
    });

    // FILTER: CUTOFF + RES knobs
    {
      const k1 = makeKnob({ label: "CUTOFF", color: 0x00ffd0, x: -0.95, y: 0, z: KNOB_Y,
        min: 60, max: 12000, parent: panel,
        get: () => A.synth.getParam("cutoff"),
        set: v => A.synth.setParam("cutoff", v),
      });
      const k2 = makeKnob({ label: "RES", color: 0x00ffd0, x: -0.75, y: 0, z: KNOB_Y,
        min: 0, max: 1, parent: panel,
        get: () => A.synth.getParam("resonance"),
        set: v => A.synth.setParam("resonance", v),
      });
      interactables.push(k1.item, k2.item);
    }

    // AMP: A D S R knobs
    {
      const knobs = [
        { label: "A", x: -0.45, key: "attack",  min: 0.001, max: 2,   color: 0xffae00 },
        { label: "D", x: -0.25, key: "decay",   min: 0.01,  max: 2,   color: 0xffae00 },
        { label: "S", x: -0.05, key: "sustain", min: 0,     max: 1,   color: 0xffae00 },
        { label: "R", x:  0.15, key: "release", min: 0.01,  max: 3,   color: 0xffae00 },
      ];
      knobs.forEach(k => {
        const kn = makeKnob({ label: k.label, color: k.color, x: k.x, y: 0, z: KNOB_Y,
          min: k.min, max: k.max, parent: panel,
          get: () => A.synth.getParam(k.key),
          set: v => A.synth.setParam(k.key, v),
        });
        interactables.push(kn.item);
      });
    }

    // ===== panelButton helper (declared here so it can flow into all sections) =====
    function panelButton(label, color, w, h, x, y, action, getOn) {
      const offMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, emissive: color, emissiveIntensity: 0.0, roughness: 0.5 });
      const onMat  = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.45 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.030), offMat);
      mesh.position.set(x, y, 0.045); panel.add(mesh);
      // tiny LED dot above the button (Prophet style)
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.006),
        new THREE.MeshBasicMaterial({ color: 0x2a0a0a }));
      led.position.set(x, y + h/2 + 0.018, 0.046);
      panel.add(led);
      const lcnv = document.createElement("canvas");
      lcnv.width = 192; lcnv.height = 64;
      const lc = lcnv.getContext("2d");
      lc.fillStyle = "rgba(0,0,0,0)"; lc.fillRect(0, 0, 192, 64);
      lc.fillStyle = "#e8f4ff"; lc.font = "bold 28px monospace";
      lc.textAlign = "center"; lc.textBaseline = "middle";
      lc.fillText(label, 96, 32);
      const ltex = new THREE.CanvasTexture(lcnv); ltex.encoding = THREE.sRGBEncoding;
      const lblMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, h * 0.55),
        new THREE.MeshBasicMaterial({ map: ltex, transparent: true, toneMapped: false }));
      lblMesh.position.set(x, y - h/2 - 0.020, 0.055);
      panel.add(lblMesh);

      let hov = false, hit = 0;
      const item = {
        mesh, label,
        action: () => { action(); refresh(); paintDisplay(); },
        setHover: (on) => { hov = on; refresh(); },
        onHit: () => { hit = 1.0; },
        tick: (dt) => {
          if (hit > 0) hit = Math.max(0, hit - dt * 6);
          mesh.position.z = 0.045 - 0.010 * hit;
        },
      };
      function refresh() {
        const on = !!getOn?.();
        mesh.material = on ? onMat : offMat;
        mesh.material.emissiveIntensity = on ? 0.8 : (hov ? 0.30 : 0.0);
        led.material.color.setHex(on ? 0xff3030 : 0x2a0a0a);
      }
      refresh();
      interactables.push(item);
      return { refresh };
    }

    // FX: DST toggle
    panelButton("DST",  0xffae00, 0.10, 0.085, 0.40, KNOB_Y - 0.04,
      () => A.synth.toggleDistortion(), () => A.synth.getParam("distortion"));

    // ARP: ARP, HOLD toggles
    panelButton("ARP",  0x00ffd0, 0.12, 0.085, 0.60, KNOB_Y - 0.04, () => {
      arpOn = !arpOn;
      if (!arpOn) { stopArp(); arpNotes = []; }
    }, () => arpOn);
    panelButton("HOLD", 0xff2bd6, 0.12, 0.085, 0.75, KNOB_Y - 0.04, () => {
      holdOn = !holdOn;
      if (!holdOn) { stopArp(); arpNotes = []; }
    }, () => holdOn);

    // PROGRAMMER: ◀ [DISPLAY] ▶  CLAIM
    panelButton("◀", 0x00ffd0, 0.07, 0.085, 0.92, KNOB_Y - 0.04, () => A.synth.prevPreset());
    panelButton("▶", 0x00ffd0, 0.07, 0.085, 1.28, KNOB_Y - 0.04, () => A.synth.nextPreset());

    // Big red 7-segment style preset display
    const dcnv = document.createElement("canvas");
    dcnv.width = 320; dcnv.height = 120;
    const dctx = dcnv.getContext("2d");
    const dtex = new THREE.CanvasTexture(dcnv);
    dtex.encoding = THREE.sRGBEncoding;
    const displayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.10),
      new THREE.MeshBasicMaterial({ map: dtex, toneMapped: false })
    );
    displayMesh.position.set(1.10, KNOB_Y - 0.04, 0.030);
    panel.add(displayMesh);
    const displayBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.13, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.6 })
    );
    displayBezel.position.set(1.10, KNOB_Y - 0.04, 0.022);
    panel.add(displayBezel);

    function paintDisplay() {
      // 7-segment-ish red display showing preset name + claim badge
      const W = dcnv.width, H = dcnv.height;
      dctx.fillStyle = "#1a0202"; dctx.fillRect(0, 0, W, H);
      // dim grid (segments look)
      dctx.fillStyle = "rgba(255,40,40,0.045)";
      for (let y = 0; y < H; y += 4) dctx.fillRect(0, y, W, 1);
      // preset name in bold red
      const p = A.synth.currentPreset();
      dctx.fillStyle = "#ff2828";
      dctx.shadowColor = "#ff3030"; dctx.shadowBlur = 8;
      dctx.font = "bold 56px monospace";
      dctx.textAlign = "center"; dctx.textBaseline = "middle";
      dctx.fillText(p.name, W / 2, H / 2 - 4);
      dctx.shadowBlur = 0;
      // small octave indicator (top-right corner)
      dctx.fillStyle = "#ff7070"; dctx.font = "bold 16px monospace";
      dctx.textAlign = "right";
      dctx.fillText("OCT " + A.synth.state.octave, W - 8, 18);
      // Claim badge (only in multiplayer)
      const MP = window.METRO_MP;
      if (MP && MP.isConnected()) {
        const c = MP.getClaim("synth");
        let bg, txt, text;
        if (c === MP.myRole())  { bg = "#00ffd0"; txt = "#001512"; text = "YOURS"; }
        else if (c)             { bg = "#ff4040"; txt = "#ffffff"; text = "PRTNR"; }
        else                    { bg = "#1a2228"; txt = "#9cffe6"; text = "OPEN"; }
        dctx.fillStyle = bg; dctx.fillRect(8, H - 28, 80, 22);
        dctx.fillStyle = txt; dctx.font = "bold 14px monospace";
        dctx.textAlign = "left";
        dctx.fillText(text, 14, H - 13);
      }
      dtex.needsUpdate = true;
    }
    paintDisplay();
    window.METRO_MP?.onClaims?.(() => paintDisplay());

    // CLAIM in PROGRAMMER row
    panelButton("🔒", 0xff2bd6, 0.085, 0.085, 1.385, KNOB_Y - 0.04, () => {
      const MP = window.METRO_MP;
      if (!MP || !MP.isConnected()) {
        window.METRO_TOAST?.("Start a JAM session to claim instruments");
        return;
      }
      if (MP.iAmOwner("synth")) MP.setClaim("synth", "release");
      else if (MP.claimAvailable("synth")) MP.setClaim("synth", "me");
      else window.METRO_TOAST?.("Synth claimed by partner");
      paintDisplay();
    }, () => window.METRO_MP?.iAmOwner?.("synth"));

    // OCT: OCT- / OCT+ buttons
    panelButton("OCT-", 0xc8a557, 0.085, 0.085, 1.525, KNOB_Y - 0.04,
      () => A.synth.setOctave(A.synth.state.octave - 1));
    panelButton("OCT+", 0xc8a557, 0.085, 0.085, 1.625, KNOB_Y - 0.04,
      () => A.synth.setOctave(A.synth.state.octave + 1));

    // ===== KEYS — 3 octaves =====
    const whiteNotes = ["C","D","E","F","G","A","B","C","D","E","F","G","A","B","C","D","E","F","G","A","B","C"];
    const whiteOctaves = [4,4,4,4,4,4,4, 5,5,5,5,5,5,5, 6,6,6,6,6,6,6, 7];
    const BASE_OCT = 4;
    const N = whiteNotes.length;
    const totalWidth = 3.30;
    const kw = totalWidth / N;
    const yTop = KY + 0.23;

    const whiteMatBase = new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 0.4 });
    const blackMatBase = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    function transposedMidi(midi) {
      return midi + (A.synth.state.octave - BASE_OCT) * 12;
    }
    function registerKey(mesh, note, octave, isBlack) {
      const restY = mesh.position.y;
      let isHeld = false, pulse = 0, hov = false, origin = "local", heldMidi = null;
      const matCopy = mesh.material.clone();
      mesh.material = matCopy;
      const baseColor = matCopy.color.clone();
      const midi = noteNameToMidi(note, octave);

      const item = {
        mesh, label: `${note}${octave}`,
        action: () => {
          if (!window._metroCanPlay("synth")) return;
          const m = transposedMidi(midi);
          if (arpOn) {
            const added = arpToggleNote(m);
            isHeld = added; pulse = 1.0; origin = "local";
            if (!added) setTimeout(() => { isHeld = false; }, 100);
          } else {
            A.synth.playNote(m, 0.45);
            isHeld = true; pulse = 1.0; origin = "local";
            setTimeout(() => { isHeld = false; }, 200);
          }
        },
        beginHold: () => {
          if (!window._metroCanPlay("synth")) return;
          const m = transposedMidi(midi);
          if (arpOn) {
            const added = arpToggleNote(m);
            isHeld = added;
            pulse = 1.0; origin = "local";
          } else {
            heldMidi = m;
            A.synth.noteOn(heldMidi, 100);
            isHeld = true; pulse = 1.0; origin = "local";
          }
        },
        endHold: () => {
          if (arpOn) {
            // If HOLD is OFF, lifting the click removes the note from the
            // pattern. With HOLD on, the note stays in the pattern (sticky).
            if (!holdOn) {
              const m = transposedMidi(midi);
              arpNotes = arpNotes.filter(n => n !== m);
              if (!arpNotes.length) stopArp();
              isHeld = false;
            }
            // else: leave isHeld = true so the key stays lit while in pattern
          } else {
            if (heldMidi != null) A.synth.noteOff(heldMidi);
            heldMidi = null;
            isHeld = false;
          }
        },
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
      // Map BOTH the registered midi (for click flashes) and the transposed midi
      // (for MIDI/remote events that fire at the current octave) — only the latter
      // matters for flashes since local clicks set their own visual via beginHold.
      keyMeshes[midi] = {
        flashOn:  (o) => { isHeld = true;  pulse = 1.0; origin = o || "local"; },
        flashOff: ()  => { isHeld = false; },
      };
    }

    // white keys
    for (let i = 0; i < N; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(kw - 0.008, 0.045, 0.5), whiteMatBase);
      w.position.set(KX - totalWidth/2 + kw/2 + i * kw, yTop, KZ + 0.08);
      scene.add(w);
      registerKey(w, whiteNotes[i], whiteOctaves[i], false);
    }
    // Black keys sit clearly ABOVE the white keys (no z-fighting). White-key
    // top is at yTop + 0.0225 (key height 0.045 / 2). Black bottom needs to
    // start above that, so raise by ~0.040.
    for (let i = 0; i < N - 1; i++) {
      const n = whiteNotes[i];
      if (n === "E" || n === "B") continue;
      const octave = whiteOctaves[i];
      const bnote = n + "#";
      const bk = new THREE.Mesh(new THREE.BoxGeometry(kw * 0.6, 0.045, 0.30), blackMatBase);
      bk.position.set(KX - totalWidth/2 + kw + i * kw, yTop + 0.045, KZ - 0.08);
      scene.add(bk);
      registerKey(bk, bnote, octave, true);
    }

    return { repaint: paintDisplay };
  }

  function noteNameToMidi(noteName, octave) {
    const map = { C:0, "C#":1, D:2, "D#":3, E:4, F:5, "F#":6, G:7, "G#":8, A:9, "A#":10, B:11 };
    return map[noteName] + (parseInt(octave) + 1) * 12;
  }

  /* ============================================================
     REMOTE AVATAR
     ============================================================ */
  function buildRemoteAvatar(scene) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x0d4a40, emissive: 0x004a3d, emissiveIntensity: 0.4, roughness: 0.5 })
    );
    body.position.y = 0.85; g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.6 })
    );
    head.position.y = 1.55; g.add(head);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0 })
    );
    visor.position.set(0, 1.55, 0.20); g.add(visor);
    const tcnv = document.createElement("canvas");
    tcnv.width = 256; tcnv.height = 64;
    const tc = tcnv.getContext("2d");
    tc.fillStyle = "rgba(0,0,0,0.65)"; tc.fillRect(0, 0, 256, 64);
    tc.fillStyle = "#00ffd0"; tc.font = "bold 28px monospace";
    tc.textAlign = "center"; tc.textBaseline = "middle";
    tc.fillText("PARTNER", 128, 32);
    const ttex = new THREE.CanvasTexture(tcnv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ttex, transparent: true }));
    sprite.scale.set(0.8, 0.2, 1); sprite.position.y = 2.05; g.add(sprite);
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
