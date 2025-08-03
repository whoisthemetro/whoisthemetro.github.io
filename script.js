const audio = document.getElementById("audio");
const title = document.getElementById("song-title");
const songs = [
  { title: "Song 1", file: "assets/songs/song1.mp3" },
  { title: "Song 2", file: "assets/songs/song2.mp3" },
  { title: "Song 3", file: "assets/songs/song3.mp3" },
];

let index = 0;

function loadSong(i) {
  audio.src = songs[i].file;
  title.textContent = songs[i].title;
}

function togglePlay() {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

function prevSong() {
  index = (index - 1 + songs.length) % songs.length;
  loadSong(index);
  audio.play();
}

function nextSong() {
  index = (index + 1) % songs.length;
  loadSong(index);
  audio.play();
}

loadSong(index);
