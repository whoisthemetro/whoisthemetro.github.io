/* ============================================================
   METRO — APP SHELL
   - SPA scene switching (lobby / gallery / studio / videos)
   - Persistent music player (mini bar + fullscreen overlay)
   - Toast, modal helpers
   ============================================================ */

(function () {
  const { SONGS, VAULT_PASSWORD, PHOTOS, VIDEOS, LINKS } = window.METRO_DATA;

  /* ---------- State ---------- */
  const state = {
    scene: "lobby",          // lobby | gallery | studio | videos
    audio: new Audio(),
    queue: SONGS.filter(s => !s.vault),
    fullQueue: SONGS.slice(),
    idx: 0,
    playing: false,
    vaultUnlocked: false,
    sceneInstances: { gallery: null, studio: null },
  };
  state.audio.preload = "auto";

  /* ---------- DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const create = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg, dur = 1800) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), dur);
  }
  window.METRO_TOAST = toast;

  /* ============================================================
     SCENE ROUTER
     ============================================================ */
  function go(scene) {
    if (scene === state.scene) return;
    // tear down previous 3D scene if any
    if (state.scene === "gallery" && state.sceneInstances.gallery) {
      state.sceneInstances.gallery.stop();
    }
    if (state.scene === "studio" && state.sceneInstances.studio) {
      state.sceneInstances.studio.stop();
    }

    $$(".scene").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(`scene-${scene}`);
    if (el) el.classList.add("active");

    // update nav highlight
    $$("#topnav .navlinks button").forEach(b => {
      b.classList.toggle("active", b.dataset.go === scene);
    });

    state.scene = scene;

    if (scene === "gallery") {
      if (!state.sceneInstances.gallery) {
        state.sceneInstances.gallery = window.METRO_GALLERY.init();
      } else {
        state.sceneInstances.gallery.start();
      }
    } else if (scene === "studio") {
      if (!state.sceneInstances.studio) {
        state.sceneInstances.studio = window.METRO_STUDIO.init();
      } else {
        state.sceneInstances.studio.start();
      }
    } else if (scene === "videos") {
      renderVideoGrid();
    }
  }
  window.METRO_GO = go;

  /* ============================================================
     MUSIC PLAYER
     ============================================================ */
  function rebuildQueue() {
    state.queue = state.fullQueue.filter(s => !s.vault || state.vaultUnlocked);
  }

  function currentSong() { return state.queue[state.idx]; }

  function play(idx) {
    if (idx != null) state.idx = (idx + state.queue.length) % state.queue.length;
    const s = currentSong();
    if (!s) return;
    if (state.audio.src !== new URL(s.src, location.href).href) {
      state.audio.src = s.src;
    }
    state.audio.play().then(() => {
      state.playing = true;
      renderPlayer();
    }).catch(err => {
      console.warn("Audio play failed", err);
      toast("Click again to start audio");
    });
  }

  function pause() {
    state.audio.pause();
    state.playing = false;
    renderPlayer();
  }

  function toggle() { state.playing ? pause() : play(); }
  function next() { play(state.idx + 1); }
  function prev() {
    if (state.audio.currentTime > 3) { state.audio.currentTime = 0; return; }
    play(state.idx - 1);
  }

  state.audio.addEventListener("ended", next);
  state.audio.addEventListener("timeupdate", () => renderProgress());
  state.audio.addEventListener("loadedmetadata", () => renderProgress());

  // expose for other modules (studio wall screen, etc.)
  window.METRO_PLAYER = {
    play, pause, toggle, next, prev,
    isPlaying: () => state.playing,
    current: () => currentSong(),
    audio: state.audio,
    playSong: (id) => {
      const i = state.queue.findIndex(s => s.id === id);
      if (i >= 0) play(i);
    },
    openFull: () => openFull(),
    closeFull: () => closeFull(),
  };

  /* ---------- Player UI rendering ---------- */
  function renderPlayer() {
    const s = currentSong();
    const mini = $("#miniplayer");
    if (!s) { mini.classList.add("hidden"); return; }
    mini.classList.remove("hidden");
    $("#mini-art").style.backgroundImage = s.art ? `url("${s.art}")` : "none";
    $("#mini-t").textContent = s.title;
    $("#mini-a").textContent = s.artist;
    $("#mini-play").innerHTML = state.playing ? "&#10074;&#10074;" : "&#9654;";

    if ($("#musicfull").classList.contains("show")) renderFull();
  }
  function renderProgress() {
    const a = state.audio;
    const pct = a.duration ? (a.currentTime / a.duration * 100) : 0;
    $("#mini-bar").style.width = pct + "%";
    if ($("#musicfull").classList.contains("show")) {
      $("#full-bar").style.width = pct + "%";
      $("#full-cur").textContent = fmtTime(a.currentTime);
      $("#full-dur").textContent = fmtTime(a.duration);
    }
  }
  function fmtTime(t) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function renderFull() {
    const s = currentSong();
    if (!s) return;
    $("#full-art").style.backgroundImage = s.art ? `url("${s.art}")` : "none";
    $("#full-t").textContent = s.title;
    $("#full-a").textContent = s.artist;
    $("#full-play").innerHTML = state.playing ? "&#10074;&#10074;" : "&#9654;";

    const list = $("#full-list");
    list.innerHTML = "";
    state.queue.forEach((song, i) => {
      const row = create("div", { class: "row" + (i === state.idx ? " active" : ""), onclick: () => play(i) },
        create("div", { class: "num" }, String(i + 1).padStart(2, "0")),
        create("div", {},
          create("div", { class: "ti" }, song.title),
          create("div", { class: "ar" }, song.artist)
        ),
        song.vault ? create("div", { class: "badge" }, "VAULT") : null
      );
      list.appendChild(row);
    });

    // vault prompt
    const vp = $("#vault-prompt");
    vp.style.display = state.vaultUnlocked ? "none" : "flex";
  }

  function openFull() { $("#musicfull").classList.add("show"); renderFull(); renderProgress(); }
  function closeFull() { $("#musicfull").classList.remove("show"); }

  /* ============================================================
     VIDEOS
     ============================================================ */
  function renderVideoGrid() {
    const grid = $("#videos-grid");
    if (grid.dataset.built) return;
    grid.dataset.built = "1";
    VIDEOS.forEach((v, i) => {
      const tile = create("div", { class: "vtile", onclick: () => openVideo(i) });
      if (v.youtube) {
        tile.style.background = "#111";
        tile.appendChild(create("div", { class: "play-ico", html: "&#9654;" }));
      } else if (v.src) {
        const vid = document.createElement("video");
        vid.src = v.src; vid.muted = true; vid.playsInline = true; vid.preload = "metadata";
        vid.addEventListener("mouseenter", () => vid.play().catch(()=>{}));
        vid.addEventListener("mouseleave", () => { vid.pause(); vid.currentTime = 0; });
        tile.appendChild(vid);
        tile.appendChild(create("div", { class: "play-ico", html: "&#9654;" }));
      }
      tile.appendChild(create("div", { class: "ovr" },
        create("div", { class: "ti" }, v.title || "Untitled")
      ));
      grid.appendChild(tile);
    });
  }
  function openVideo(i) {
    const v = VIDEOS[i];
    const vp = $("#videoplayer");
    const frame = $("#videoplayer .frame");
    frame.innerHTML = "";
    if (v.youtube) {
      const ifr = document.createElement("iframe");
      ifr.src = `https://www.youtube.com/embed/${v.youtube}?autoplay=1`;
      ifr.allow = "autoplay; fullscreen; encrypted-media";
      ifr.allowFullscreen = true;
      frame.appendChild(ifr);
    } else {
      const video = document.createElement("video");
      video.src = v.src; video.controls = true; video.autoplay = true; video.playsInline = true;
      frame.appendChild(video);
    }
    vp.classList.add("show");
  }
  function closeVideo() {
    $("#videoplayer").classList.remove("show");
    $("#videoplayer .frame").innerHTML = "";
  }

  /* ============================================================
     PHOTO MODAL (used by gallery scene)
     ============================================================ */
  let modalPhotos = [], modalIdx = 0;
  function openPhotoModal(photos, startIdx) {
    modalPhotos = photos; modalIdx = startIdx;
    renderPhotoModal();
    $("#photomodal").classList.add("show");
  }
  function renderPhotoModal() {
    const p = modalPhotos[modalIdx];
    if (!p) return;
    $("#photomodal img").src = p.src;
    $("#photo-title").textContent = p.title || "";
    $("#photo-desc").textContent = p.caption || "";
  }
  function closePhotoModal() { $("#photomodal").classList.remove("show"); }
  function photoNext(dir) {
    modalIdx = (modalIdx + dir + modalPhotos.length) % modalPhotos.length;
    renderPhotoModal();
  }
  window.METRO_PHOTO_MODAL = { open: openPhotoModal };

  /* ============================================================
     INIT / WIRING
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    // nav
    $$("#topnav .navlinks button").forEach(b => {
      b.addEventListener("click", () => go(b.dataset.go));
    });
    $("#brand").addEventListener("click", () => go("lobby"));
    $("#topnav-music").addEventListener("click", openFull);

    // lobby portals
    $$("#lobby [data-go]").forEach(b => {
      b.addEventListener("click", () => go(b.dataset.go));
    });
    // lobby external links
    $("#lk-ig").href = LINKS.instagram;
    $("#lk-gh").href = LINKS.github;
    $("#lk-em").href = LINKS.email;

    // mini player
    $("#mini-play").addEventListener("click", toggle);
    $("#mini-prev").addEventListener("click", prev);
    $("#mini-next").addEventListener("click", next);
    $("#mini-meta").addEventListener("click", openFull);

    // full overlay
    $("#full-close").addEventListener("click", closeFull);
    $("#full-play").addEventListener("click", toggle);
    $("#full-prev").addEventListener("click", prev);
    $("#full-next").addEventListener("click", next);
    $("#full-scrub").addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - r.left) / r.width;
      if (state.audio.duration) state.audio.currentTime = pct * state.audio.duration;
    });
    $("#vault-go").addEventListener("click", () => {
      const v = $("#vault-input").value.trim().toLowerCase();
      if (v === VAULT_PASSWORD) {
        state.vaultUnlocked = true;
        rebuildQueue();
        toast("Vault unlocked");
        renderFull();
      } else {
        toast("Wrong password");
      }
    });

    // videos
    $("#videoplayer .close").addEventListener("click", closeVideo);
    $("#videoplayer").addEventListener("click", (e) => {
      if (e.target.id === "videoplayer") closeVideo();
    });

    // photo modal
    $("#photomodal .close").addEventListener("click", closePhotoModal);
    $("#photomodal .prev").addEventListener("click", () => photoNext(-1));
    $("#photomodal .next").addEventListener("click", () => photoNext(1));
    $("#photomodal").addEventListener("click", (e) => {
      if (e.target.id === "photomodal") closePhotoModal();
    });

    // global keys
    window.addEventListener("keydown", (e) => {
      // ignore when typing in input
      if (e.target.matches("input, textarea")) return;

      if (e.key === "m" || e.key === "M") {
        if ($("#musicfull").classList.contains("show")) closeFull();
        else openFull();
      }
      if (e.key === "Escape") {
        if ($("#musicfull").classList.contains("show")) { closeFull(); return; }
        if ($("#videoplayer").classList.contains("show")) { closeVideo(); return; }
        if ($("#photomodal").classList.contains("show")) { closePhotoModal(); return; }
        // let instrument overlay handle its own Escape close (studio.js)
        if (document.querySelector("#instrument-overlay.show")) return;
        if (state.scene !== "lobby") go("lobby");
      }
      // spacebar play/pause when not in 3D scene
      if (e.code === "Space" && (state.scene === "lobby" || state.scene === "videos" || $("#musicfull").classList.contains("show"))) {
        e.preventDefault();
        toggle();
      }
    });

    // load first song metadata
    if (state.queue[0]) {
      state.audio.src = state.queue[0].src;
      renderPlayer();
    }

    // ----- MULTIPLAYER PANEL -----
    wireMultiplayer();
  });

  function wireMultiplayer() {
    const MP = window.METRO_MP;
    if (!MP) return;
    const btn = $("#mp-btn");
    const panel = $("#mp-panel");
    const hostBtn = $("#mp-host");
    const joinBtn = $("#mp-join");
    const leaveBtn = $("#mp-leave");
    const hostCode = $("#mp-host-code");
    const codeText = $("#mp-code-text");
    const copyBtn = $("#mp-copy");
    const joinInput = $("#mp-join-input");
    const codeInput = $("#mp-code-input");
    const joinGo = $("#mp-join-go");
    const status = $("#mp-status");

    function setStatus(t, cls) {
      status.textContent = t;
      status.className = "status " + (cls || "");
    }

    btn.addEventListener("click", () => panel.classList.toggle("show"));

    hostBtn.addEventListener("click", async () => {
      try {
        setStatus("CONNECTING…");
        btn.classList.add("connecting");
        joinInput.style.display = "none";
        const code = await MP.host();
        codeText.textContent = code;
        hostCode.style.display = "block";
        setStatus("WAITING FOR PARTNER…");
      } catch (e) {
        setStatus("CONNECTION FAILED", "err");
        btn.classList.remove("connecting");
      }
    });

    joinBtn.addEventListener("click", () => {
      hostCode.style.display = "none";
      joinInput.style.display = "flex";
      codeInput.focus();
    });

    joinGo.addEventListener("click", async () => {
      const code = codeInput.value.trim();
      if (!code) return;
      try {
        setStatus("CONNECTING…");
        btn.classList.add("connecting");
        await MP.join(code);
      } catch (e) {
        setStatus("CANNOT REACH HOST", "err");
        btn.classList.remove("connecting");
      }
    });

    leaveBtn.addEventListener("click", () => MP.leave());

    copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(codeText.textContent);
      copyBtn.textContent = "COPIED";
      setTimeout(() => copyBtn.textContent = "COPY", 1200);
    });

    MP.onConnected(() => {
      btn.classList.remove("connecting"); btn.classList.add("connected");
      setStatus("CONNECTED — JAM ON", "ok");
      leaveBtn.style.display = "inline-block";
      hostBtn.style.display = "none";
      joinBtn.style.display = "none";
    });
    MP.onDisconnected(() => {
      btn.classList.remove("connected", "connecting");
      setStatus("DISCONNECTED");
      leaveBtn.style.display = "none";
      hostBtn.style.display = "inline-block";
      joinBtn.style.display = "inline-block";
      hostCode.style.display = "none";
      joinInput.style.display = "none";
    });
  }
})();
