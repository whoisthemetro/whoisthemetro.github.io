/* ============================================================
   METRO — DATA LAYER
   Edit this file to add/remove/reorder songs, photos, videos.
   No other files need to change.
   ============================================================ */

window.METRO_DATA = (function () {

  /* ---------- SONGS ----------
     Add a song: drop the .mp3 in assets/songs/ then add an entry.
     `vault: true` means it's hidden until the user enters the password.
  */
  const SONGS = [
    { id: "burrito",     title: "Burrito Song",  artist: "Metro", src: "assets/songs/burritosong.mp3", art: "assets/images/FARTGOD.png" },
    { id: "beatmonster", title: "Beat Monster",  artist: "Metro", src: "assets/songs/beatmonster.mp3", art: "assets/images/metro%20duuude.png" },
    { id: "iwannafall",  title: "I Wanna Fall",  artist: "Metro", src: "assets/songs/iwannafall.mp3",  art: "assets/photos/BRC04309_2.jpg" },
    { id: "omg",         title: "OMG",           artist: "Metro", src: "assets/songs/omg.mp3",         art: "assets/photos/BRC04537.jpg" },
    { id: "signs",       title: "Signs",         artist: "Metro", src: "assets/songs/signs.mp3",       art: "assets/photos/BRC04548.jpg" },
    { id: "ninetofive",  title: "Nine to Five",  artist: "Metro", src: "assets/songs/ninetofive.mp3",  art: "assets/photos/BRC04549.jpg" },
    { id: "song1",       title: "Unreleased 01", artist: "Metro", src: "assets/songs/song1.mp3", vault: true, art: "assets/photos/BRC06321.jpg" },
    { id: "song2",       title: "Unreleased 02", artist: "Metro", src: "assets/songs/song2.mp3", vault: true, art: "assets/photos/BRC06428.jpg" },
    { id: "song3",       title: "Unreleased 03", artist: "Metro", src: "assets/songs/song3.mp3", vault: true, art: "assets/photos/BRC07004.jpg" },
  ];

  const VAULT_PASSWORD = "burrito";

  /* ---------- PHOTOS ----------
     Each photo entry can include:
       src     — path (required)
       title   — optional, shown in fullscreen
       caption — optional, shown in fullscreen
       size    — "small" | "medium" | "large" | "hero"   (default: cycled small/medium)
       wall    — "north" | "south" | "east" | "west" | "center"   (default: auto-distributed)
       group   — string id; photos sharing a group form a salon cluster

     If you don't set wall/size, the gallery distributes evenly across walls
     and varies sizes for visual rhythm.
  */
  const PHOTOS = [
    { src: "assets/photos/1-BRC04936.jpg" },
    { src: "assets/photos/1-BRC05724.jpg" },
    { src: "assets/photos/1-BRC05979.jpg" },
    { src: "assets/photos/1-BRC06006.jpg" },
    { src: "assets/photos/1-BRC06247.jpg" },
    { src: "assets/photos/11-BRC06077.jpg" },
    { src: "assets/photos/2-BRC04932.jpg" },
    { src: "assets/photos/2-BRC05530.jpg" },
    { src: "assets/photos/2-BRC05720.jpg" },
    { src: "assets/photos/2-BRC05973.jpg" },
    { src: "assets/photos/2026-05-09_18-03-07_B_R8_S4.jpg" },
    { src: "assets/photos/2026-05-09_18-14-10_B_R8_S4.jpg" },
    { src: "assets/photos/3-BRC05963.jpg" },
    { src: "assets/photos/5-BRC04928.jpg" },
    { src: "assets/photos/6-BRC04927.jpg" },
    { src: "assets/photos/6-BRC05563.jpg" },
    { src: "assets/photos/7-BRC04925.jpg" },
    { src: "assets/photos/8-BRC06098.jpg" },
    { src: "assets/photos/9-BRC04922.jpg" },
    { src: "assets/photos/9-BRC06085.jpg" },
    { src: "assets/photos/BRC04309_2.jpg" },
    { src: "assets/photos/BRC04537.jpg" },
    { src: "assets/photos/BRC04537_2.jpg" },
    { src: "assets/photos/BRC04548.jpg" },
    { src: "assets/photos/BRC04548_2.jpg" },
    { src: "assets/photos/BRC04549.jpg" },
    { src: "assets/photos/BRC04549_2.jpg" },
    { src: "assets/photos/BRC049201.jpg" },
    { src: "assets/photos/BRC05535.jpg" },
    { src: "assets/photos/BRC05625.jpg" },
    { src: "assets/photos/BRC05683.jpg" },
    { src: "assets/photos/BRC05707.jpg" },
    { src: "assets/photos/BRC05756.jpg" },
    { src: "assets/photos/BRC05763.jpg" },
    { src: "assets/photos/BRC06023.jpg" },
    { src: "assets/photos/BRC06321.jpg" },
    { src: "assets/photos/BRC06428.jpg" },
    { src: "assets/photos/BRC06429.jpg" },
    { src: "assets/photos/BRC06432.jpg" },
    { src: "assets/photos/BRC06500.jpg" },
    { src: "assets/photos/BRC06506_1.jpg" },
    { src: "assets/photos/BRC06508.jpg" },
    { src: "assets/photos/BRC06515.jpg" },
    { src: "assets/photos/BRC06577.jpg" },
    { src: "assets/photos/BRC06610.jpg" },
    { src: "assets/photos/BRC06619.jpg" },
    { src: "assets/photos/BRC06621.jpg" },
    { src: "assets/photos/BRC06637.jpg" },
    { src: "assets/photos/BRC06656.jpg" },
    { src: "assets/photos/BRC06659.jpg" },
    { src: "assets/photos/BRC06866-2.jpg" },
    { src: "assets/photos/BRC06866-3.jpg" },
    { src: "assets/photos/BRC06866-5.jpg" },
    { src: "assets/photos/BRC06866.jpg" },
    { src: "assets/photos/BRC06887.jpg" },
    { src: "assets/photos/BRC06890-2.jpg" },
    { src: "assets/photos/BRC06895.jpg" },
    { src: "assets/photos/BRC06903-2.jpg" },
    { src: "assets/photos/BRC06903-3.jpg" },
    { src: "assets/photos/BRC06903.jpg" },
    { src: "assets/photos/BRC07004.jpg" },
    { src: "assets/photos/BRC07007.jpg" },
    { src: "assets/photos/BRC07019.jpg" },
    { src: "assets/photos/BRC07030.jpg" },
    { src: "assets/photos/BRC07042-2.jpg" },
    { src: "assets/photos/BRC07045.jpg" },
    { src: "assets/photos/BRC07052.jpg" },
    { src: "assets/photos/BRC07053.jpg" },
    { src: "assets/photos/BRC07122.jpg" },
    { src: "assets/photos/BRC07623.jpg" },
    { src: "assets/photos/BRC07624.jpg" },
    { src: "assets/photos/BRC07625.jpg" },
    { src: "assets/photos/BRC07626.jpg" },
    { src: "assets/photos/BRC07632.jpg" },
    { src: "assets/photos/BRC07633.jpg" },
    { src: "assets/photos/BRC07638.jpg" },
    { src: "assets/photos/BRC07642.jpg" },
    { src: "assets/photos/BRC07643.jpg" },
    { src: "assets/photos/BRC07647.jpg" },
    { src: "assets/photos/BRC07648.jpg" },
    { src: "assets/photos/BRC07700.jpg" },
    { src: "assets/photos/BRC07720.jpg" },
    { src: "assets/photos/BRC07740.jpg" },
    { src: "assets/photos/BRC07756.jpg" },
    { src: "assets/photos/BRC07757.jpg" },
    { src: "assets/photos/BRC07765-2.jpg" },
    { src: "assets/photos/BRC07770.jpg" },
    { src: "assets/photos/BRC07783.jpg" },
    { src: "assets/photos/BRC07785.jpg" },
    { src: "assets/photos/BRC07800.jpg" },
    { src: "assets/photos/BRC07805.jpg" },
    { src: "assets/photos/BRC08467.jpg" },
    { src: "assets/photos/BRC08469.jpg" },
    { src: "assets/photos/BRC09218.jpg" },
    { src: "assets/photos/BRC09223.jpg" },
    { src: "assets/photos/BRC09243.jpg" },
    { src: "assets/photos/IMG_3906_2.jpg" },
  ];

  /* ---------- VIDEOS ----------
     For local files: { src: "assets/videos/foo.mp4", poster: "..." }
     For YouTube:     { youtube: "VIDEO_ID", title: "..." }
  */
  const VIDEOS = [
    { src: "assets/videos/video1.mp4", title: "Video 01" },
    { src: "assets/videos/art1.mp4",   title: "Art Piece 01" },
    { src: "assets/images/MVI_3417.mp4", title: "Clip 3417" },
  ];

  /* ---------- LINKS ---------- */
  const LINKS = {
    instagram: "https://instagram.com/whoisthemetro",
    github:    "https://github.com/whoisthemetro",
    email:     "mailto:whoisthemetro@gmail.com",
  };

  /* ---------- CAPTIONS ----------
     Pool of short, low-key one-liners assigned deterministically by
     filename hash. Each photo always gets the same caption from this
     pool unless you set an explicit `title:` or `caption:` on the
     photo entry above.
     Add or edit freely — captions reshuffle if the pool length changes.
  */
  const CAPTION_POOL = [
    "Pretty sure that's load-bearing",
    "Take three, no notes",
    "Mildly cinematic",
    "Reasonable hostage",
    "Mild crime scene",
    "Negotiating with the void",
    "Off-brand serenity",
    "Reluctantly photogenic",
    "Suspicious amount of vibes",
    "Brunch was a mistake",
    "Found art, also lost",
    "Plausibly deniable",
    "Free with purchase",
    "Held together by ambition",
    "Conceptually employed",
    "On hold with the universe",
    "Loosely tethered",
    "Off-camera, thriving",
    "Approved by no committee",
    "Aspirationally still",
    "Insurance won't cover this",
    "Aggressively optional",
    "Allegedly Tuesday",
    "Lightly haunted",
    "Pending review",
    "Conditional grace",
    "Asked very nicely",
    "Off-menu",
    "Roughly a feeling",
    "Hosted by gravity",
    "Unsanctioned event",
    "Possibly a metaphor",
    "Discount immortality",
    "Trial separation from clarity",
    "Vibes, audited",
    "Faintly diplomatic",
    "Witnessed by nobody",
    "Reasonable for a Tuesday",
    "Soft launch",
    "Quietly suspicious",
    "Loitering with intent",
    "Probably the protagonist",
    "Not for resale",
    "Lightly toasted",
    "Vouched for by nobody",
    "Tax-deductible feeling",
    "Photogenic by accident",
    "Loud whisper",
    "Tactically silent",
    "Borrowed gravity",
    "Marked safe from clarity",
    "Briefly important",
    "Operating at vibe capacity",
    "Sponsored by sleep deprivation",
    "Mostly a vibe",
    "On thin ice, looks good",
    "Reasonable doubt",
    "Half-committed",
    "Asking for a friend",
    "Spiritually unbothered",
    "Light vandalism",
    "Almost a plan",
    // a few quieter holdouts so the pool isn't entirely deadpan
    "Late spring", "Half-light", "On the way out", "Almost",
  ];

  // Stable string → small int. Used to pick a caption for each photo.
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
  function autoCaption(src) {
    return CAPTION_POOL[hashStr(src || "") % CAPTION_POOL.length];
  }

  return { SONGS, VAULT_PASSWORD, PHOTOS, VIDEOS, LINKS, CAPTION_POOL, autoCaption };
})();
