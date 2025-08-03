const audio = document.getElementById("audio");
const title = document.getElementById("song-title");
const artistCredits = document.getElementById("artist-credits");
const volume = document.getElementById("volume");
const songs = [
  { title: "Signs", file: "assets/songs/signs.mp3", artist: "whoistheMETRO feat. Jacqueline Van Bierk", credits: "Produced, Mixed, Mastered" },
  { title: "Beat Monster", file: "assets/songs/beatmonster.mp3", artist: "Spesh to Death", credits: "Produced, Mixed, Mastered" },
  { title: "Song 3", file: "assets/songs/song3.mp3", artist: "Metro", credits: "Produced by Metro, Mastered by Studio Z" },
];

let index = 0;

function loadSong(i) {
  audio.src = songs[i].file;
  title.textContent = songs[i].title;
  artistCredits.textContent = `Artist: ${songs[i].artist} | Credits: ${songs[i].credits}`;
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
