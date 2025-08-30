const audio = document.getElementById("audio");
const title = document.getElementById("song-title");
if (audio && title) {
  audio.play().then(() => {
    console.log("Audio playing successfully");
  }).catch((err) => {
    console.error("Error playing audio:", err);
  });
} else {
  console.error("Audio or title element not found");
}
audio.addEventListener("error", (e) => {
  console.error("Error loading audio: ", e.message);
});
const artistCredits = document.getElementById("artist-credits");
const volume = document.getElementById("volume");
audio.addEventListener("error", (e) => {
  console.error("Error loading audio: ", e.message);
});
const songs = [
  { title: "Signs", file: "assets/songs/signs.mp3", artist: "whoistheMETRO feat. Jacqueline Van Bierk", credits: "Produced, Mixed, Mastered" },
  { title: "Beat Monster", file: "assets/songs/beatmonster.mp3", artist: "Spesh to Death", credits: "Produced, Mixed, Mastered" },
  { title: "I Wanna Fall", file: "assets/songs/iwannafall.mp3", artist: "Drea", credits: "Produced, Mixed, Mastered" },
  { title: "Workin' This 9-5", file: "assets/songs/ninetofive.mp3", artist: "J-Legacy HDElite", credits: "Produced, Mixed, Mastered" },
  { title: "Burrito", file: "assets/songs/burritosong.mp3", artist: "whoistheMETRO", credits: "Produced, Mixed, Mastered" },
  { title: "Oh My God, It's fartGOD", file: "assets/songs/omg.mp3", artist: "fartGOD", credits: "Produced, Mixed, Mastered" },
];

const player = document.getElementById("player");
let index = 0;

function loadSong(i) {
  audio.src = songs[i].file;
  title.textContent = songs[i].title;
  artistCredits.innerHTML = `Artist: <span class="artist-bold">${songs[i].artist}</span> | Credits: ${songs[i].credits}`;
  audio.play();
}

function generateTracklist() {
  const container = document.getElementById("tracklist");
  songs.forEach((s, i) => {
    const div = document.createElement("div");
    div.innerText = s.title;
    div.onclick = () => {
      index = i;
      loadSong(i);
    };
    container.appendChild(div);
  });
}

volume.addEventListener("input", () => {
  audio.volume = volume.value;
});

generateTracklist();

const titleEl = document.getElementById("siteTitle");
titleEl.addEventListener("mouseover", () => {
  const text = titleEl.innerText.split('');
  titleEl.innerHTML = text.map(letter => {
    const color = `hsl(${Math.random() * 360}, 100%, 70%)`;
    return `<span style="color:${color}">${letter}</span>`;
  }).join('');
});
titleEl.addEventListener("mouseout", () => {
  titleEl.innerText = "whoistheMETRO";
});

function createStars(layer, count, sizeMin, sizeMax, opacityMin, opacityMax) {
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.position = 'absolute';
    star.style.background = '#fff';
    const size = Math.random() * (sizeMax - sizeMin) + sizeMin;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.border-radius = '50%';
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 200}%`;
    star.style.opacity = Math.random() * (opacityMax - opacityMin) + opacityMin;
    layer.appendChild(star);
  }
}

const layer1 = document.getElementById('layer1');
createStars(layer1, 200, 0.5, 1.5, 0.3, 0.5);

const layer2 = document.getElementById('layer2');
createStars(layer2, 100, 1, 2.5, 0.5, 0.7);

const layer3 = document.getElementById('layer3');
createStars(layer3, 50, 2, 4, 0.7, 1);

window.addEventListener('scroll', () => {
  const scroll = window.pageYOffset;
  layer1.style.transform = `translateY(${-scroll * 0.2}px)`;
  layer2.style.transform = `translateY(${-scroll * 0.4}px)`;
  layer3.style.transform = `translateY(${-scroll * 0.6}px)`;
});
