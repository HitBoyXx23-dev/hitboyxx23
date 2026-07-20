const TOKEN_ENDPOINT = "https://spotify-api-mocha-nine.vercel.app/api/spotify-token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const REFRESH_INTERVAL = 1000;
const CACHE_TTL = 30 * 60 * 1000;

const PROFILE_FALLBACK = new URL(
  "../assets/profile.png",
  import.meta.url
).href;

let refreshTimer = null;
let progressTimer = null;
let refreshRunning = false;
let cachedToken = null;
let cachedTokenExpiry = 0;
let currentProgress = 0;
let currentDuration = 0;
let currentPlaying = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getElements() {
  return {
    nowRoot: document.querySelector("#spotify-now-playing"),
    recentRoot: document.querySelector("#spotify-recent"),
    fallback: document.querySelector("#spotify-fallback")
  };
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function artists(track) {
  if (!Array.isArray(track?.artists)) return "Unknown artist";

  return track.artists
    .map((artist) => artist?.name)
    .filter(Boolean)
    .join(", ") || "Unknown artist";
}

function cover(track) {
  return track?.album?.images?.[0]?.url || PROFILE_FALLBACK;
}

function formatTime(ms) {
  const seconds = Math.floor((Number(ms) || 0) / 1000);

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function cacheKey(name) {
  return `spotify-${name}`;
}

function readCache(name) {
  try {
    const item = JSON.parse(localStorage.getItem(cacheKey(name)));

    if (!item?.savedAt) return null;

    if (Date.now() - item.savedAt > CACHE_TTL) {
      return null;
    }

    return item.value;
  } catch {
    return null;
  }
}

function writeCache(name, value) {
  try {
    localStorage.setItem(
      cacheKey(name),
      JSON.stringify({
        savedAt: Date.now(),
        value
      })
    );
  } catch {}
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const data = await response.json();

  cachedToken = data.access_token;
  cachedTokenExpiry =
    Date.now() + ((Number(data.expires_in) || 3600) - 30) * 1000;

  return cachedToken;
}

async function spotifyFetch(endpoint) {
  let token = await getAccessToken();

  let response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    token = await getAccessToken(true);

    response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    });
  }

  if (response.status === 204) return null;

  return response.json();
}

function updateProgressBar() {
  if (!currentPlaying) return;

  currentProgress += 1000;

  if (currentProgress > currentDuration) {
    currentProgress = currentDuration;
  }

  const time = document.querySelector("#spotify-time");
  const bar = document.querySelector("#spotify-progress-bar");

  if (time) {
    time.textContent =
      `${formatTime(currentProgress)} / ${formatTime(currentDuration)}`;
  }

  if (bar && currentDuration) {
    bar.style.width =
      `${(currentProgress / currentDuration) * 100}%`;
  }
}

function renderNowPlaying(data, elements) {
  if (!elements.nowRoot) return;

  const track = data?.item;

  if (!track) {
    elements.nowRoot.innerHTML =
      "<div class='spotify-empty'>Nothing is playing right now.</div>";
    return;
  }

  currentProgress = Number(data.progress_ms) || 0;
  currentDuration = Number(track.duration_ms) || 0;
  currentPlaying = data.is_playing;

  const percent = currentDuration
    ? (currentProgress / currentDuration) * 100
    : 0;

  elements.nowRoot.innerHTML = `
    <article class="spotify-now-card">
      <img class="spotify-now-cover" src="${escapeHtml(cover(track))}" alt="">
      <div>
        <span>${data.is_playing ? "currently playing" : "paused"}</span>
        <h3>${escapeHtml(track.name)}</h3>
        <p>${escapeHtml(artists(track))}</p>
        <small>${escapeHtml(track.album?.name || "")}</small>

        <div class="spotify-progress">
          <div id="spotify-progress-bar" style="width:${percent}%"></div>
        </div>

        <div id="spotify-time">
          ${formatTime(currentProgress)} / ${formatTime(currentDuration)}
        </div>
      </div>
    </article>
  `;
}

function renderRecent(data, elements) {
  if (!elements.recentRoot) return;

  const tracks = data?.items || [];

  elements.recentRoot.innerHTML = tracks.map((item) => {
    const track = item.track;

    return `
      <article class="spotify-recent-card">
        <img src="${escapeHtml(cover(track))}" alt="">
        <div>
          <strong>${escapeHtml(track.name)}</strong>
          <span>${escapeHtml(artists(track))}</span>
        </div>
      </article>
    `;
  }).join("");
}

async function refreshSpotify() {
  if (refreshRunning) return;

  refreshRunning = true;

  const elements = getElements();

  try {
    const [now, recent] = await Promise.all([
      spotifyFetch("/me/player/currently-playing"),
      spotifyFetch("/me/player/recently-played?limit=5")
    ]);

    writeCache("now", now);
    writeCache("recent", recent);

    renderNowPlaying(now, elements);
    renderRecent(recent, elements);

    setHidden(elements.fallback, true);
  } catch {
    renderNowPlaying(readCache("now"), elements);
    renderRecent(readCache("recent"), elements);
  }

  refreshRunning = false;
}

function stopSpotify() {
  clearInterval(refreshTimer);
  clearInterval(progressTimer);
}

function startSpotify() {
  stopSpotify();

  refreshSpotify();

  refreshTimer = setInterval(refreshSpotify, REFRESH_INTERVAL);
  progressTimer = setInterval(updateProgressBar, 1000);
}

function initializeSpotify() {
  startSpotify();

  document.addEventListener("visibilitychange", () => {
    document.hidden ? stopSpotify() : startSpotify();
  });

  window.addEventListener("pagehide", stopSpotify);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSpotify, {
    once: true
  });
} else {
  initializeSpotify();
}
