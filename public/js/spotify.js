const TOKEN_ENDPOINT = "/api/spotify-token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const REFRESH_INTERVAL = 5000;
const CACHE_TTL = 30 * 60 * 1000;

const PROFILE_FALLBACK = new URL(
  "../assets/profile.png",
  import.meta.url
).href;

let refreshTimer = null;
let refreshRunning = false;
let cachedToken = null;
let cachedTokenExpiry = 0;

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
    nowSection: document.querySelector("#now-playing-section"),
    recentSection: document.querySelector("#recent-section"),
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

function trackUrl(track) {
  return track?.external_urls?.spotify || "https://open.spotify.com";
}

function formatTime(milliseconds) {
  const seconds = Math.max(
    0,
    Math.floor((Number(milliseconds) || 0) / 1000)
  );

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatPlayedAt(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function cacheKey(name) {
  return `hitboy-spotify-${name}`;
}

function readCache(name) {
  try {
    const raw = localStorage.getItem(cacheKey(name));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached?.savedAt || !("value" in cached)) return null;
    if (Date.now() - cached.savedAt > CACHE_TTL) return null;

    return cached.value;
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
  } catch {
  }
}

async function getAccessToken(forceRefresh) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Token request failed with ${response.status}`);
  }

  const payload = await response.json();

  if (!payload?.access_token) {
    throw new Error("Token response missing access_token");
  }

  cachedToken = payload.access_token;
  cachedTokenExpiry = Date.now() + Math.max(0, (Number(payload.expires_in) || 0) - 30) * 1000;

  return cachedToken;
}

async function spotifyFetch(path) {
  let token = await getAccessToken(false);

  let response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    token = await getAccessToken(true);

    response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    });
  }

  if (response.status === 204) {
    return null;
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Spotify returned ${response.status}`
    );
  }

  return payload;
}

function renderNowPlaying(payload, elements) {
  const track = payload?.item;

  if (!elements.nowSection || !elements.nowRoot) {
    return false;
  }

  setHidden(elements.nowSection, false);

  if (!track) {
    elements.nowRoot.innerHTML = `
      <div class="spotify-empty">
        Nothing is playing right now.
      </div>
    `;
    return false;
  }

  const progress = Number(payload.progress_ms) || 0;
  const duration = Number(track.duration_ms) || 0;
  const percent = duration > 0
    ? Math.min(100, Math.max(0, progress / duration * 100))
    : 0;

  elements.nowRoot.innerHTML = `
    <article class="spotify-now-card">
      <a
        class="spotify-cover-link"
        href="${escapeHtml(trackUrl(track))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          class="spotify-now-cover"
          src="${escapeHtml(cover(track))}"
          alt=""
        >
      </a>

      <div class="spotify-now-info">
        <span class="spotify-playing-label">
          ${payload.is_playing ? "currently playing" : "paused"}
        </span>

        <a
          class="spotify-track-title"
          href="${escapeHtml(trackUrl(track))}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHtml(track.name || "Unknown track")}
        </a>

        <span class="spotify-track-artist">
          ${escapeHtml(artists(track))}
        </span>

        <span class="spotify-track-album">
          ${escapeHtml(track.album?.name || "")}
        </span>

        <div class="spotify-progress">
          <div class="spotify-progress-fill" style="width:${percent}%"></div>
        </div>

        <div class="spotify-progress-times">
          <span>${formatTime(progress)}</span>
          <span>${formatTime(duration)}</span>
        </div>
      </div>
    </article>
  `;

  return true;
}

function renderRecent(payload, elements) {
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!elements.recentSection || !elements.recentRoot) {
    return false;
  }

  setHidden(elements.recentSection, false);

  const entries = items
    .filter((entry) => entry?.track)
    .slice(0, 5);

  if (!entries.length) {
    elements.recentRoot.innerHTML = `
      <div class="spotify-empty">
        No recent tracks are available right now.
      </div>
    `;
    return false;
  }

  elements.recentRoot.innerHTML = entries.map((entry) => {
    const track = entry.track;

    return `
      <article class="spotify-recent-card">
        <a
          class="spotify-cover-link"
          href="${escapeHtml(trackUrl(track))}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            class="spotify-recent-cover"
            src="${escapeHtml(cover(track))}"
            alt=""
          >
        </a>

        <div class="spotify-recent-info">
          <a
            class="spotify-recent-title"
            href="${escapeHtml(trackUrl(track))}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${escapeHtml(track.name || "Unknown track")}
          </a>
          <span>${escapeHtml(artists(track))}</span>
          <small>${escapeHtml(formatPlayedAt(entry.played_at))}</small>
        </div>

        <a
          class="spotify-open-button"
          href="${escapeHtml(trackUrl(track))}"
          target="_blank"
          rel="noopener noreferrer"
        >
          open
        </a>
      </article>
    `;
  }).join("");

  return true;
}

async function refreshSpotify() {
  if (refreshRunning) return;

  const elements = getElements();

  if (
    !elements.nowSection &&
    !elements.recentSection &&
    !elements.fallback
  ) {
    stopSpotify();
    return;
  }

  refreshRunning = true;

  try {
    const [nowResult, recentResult] = await Promise.allSettled([
      spotifyFetch("/me/player/currently-playing"),
      spotifyFetch("/me/player/recently-played?limit=5")
    ]);

    let nowData = null;
    let recentData = null;

    if (nowResult.status === "fulfilled") {
      nowData = nowResult.value;
      writeCache("now", nowData);
    } else {
      nowData = readCache("now");
    }

    if (recentResult.status === "fulfilled") {
      recentData = recentResult.value;
      writeCache("recent", recentData);
    } else {
      recentData = readCache("recent");
    }

    renderNowPlaying(nowData, elements);
    renderRecent(recentData, elements);

    setHidden(elements.fallback, true);
    setHidden(elements.nowSection, false);
    setHidden(elements.recentSection, false);
  } catch (error) {
    console.error("Spotify refresh failed:", error);

    renderNowPlaying(readCache("now"), elements);
    renderRecent(readCache("recent"), elements);

    setHidden(elements.fallback, true);
    setHidden(elements.nowSection, false);
    setHidden(elements.recentSection, false);
  } finally {
    refreshRunning = false;
  }
}

function stopSpotify() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startSpotify() {
  stopSpotify();
  refreshSpotify();
  refreshTimer = window.setInterval(refreshSpotify, REFRESH_INTERVAL);
}

function initializeSpotify() {
  const elements = getElements();

  if (
    !elements.nowSection &&
    !elements.recentSection &&
    !elements.fallback
  ) {
    return;
  }

  startSpotify();

  document.addEventListener(
    "visibilitychange",
    () => {
      document.hidden ? stopSpotify() : startSpotify();
    },
    { passive: true }
  );

  window.addEventListener("pagehide", stopSpotify, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeSpotify,
    { once: true }
  );
} else {
  initializeSpotify();
}
