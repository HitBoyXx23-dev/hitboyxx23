
const API_BASE = "https://spotify-connect-api.vercel.app";
const USERNAME = "HitBoyXx23";
const SHARE_URL = "https://spotify-connect-api.vercel.app/share/HitBoyXx23";
const REFRESH_INTERVAL = 5000;
const CACHE_TTL = 30 * 60 * 1000;

const PROFILE_FALLBACK = new URL(
  "../assets/profile.png",
  import.meta.url
).href;

let refreshTimer = null;
let refreshRunning = false;

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
  return track?.external_urls?.spotify || SHARE_URL;
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
    // Storage may be unavailable. The live page still works.
  }
}

function normalizeNowPlaying(payload) {
  if (payload?.item) return payload;

  if (payload?.track) {
    return {
      item: payload.track,
      is_playing: payload.is_playing !== false,
      progress_ms: Number(payload.progress_ms) || 0
    };
  }

  return payload;
}

function normalizeRecent(payload) {
  if (Array.isArray(payload?.items)) return payload;
  if (Array.isArray(payload)) return { items: payload };
  if (Array.isArray(payload?.tracks)) return { items: payload.tracks };
  return { items: [] };
}

function renderNowPlaying(payload, elements) {
  payload = normalizeNowPlaying(payload);
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
  payload = normalizeRecent(payload);

  if (!elements.recentSection || !elements.recentRoot) {
    return false;
  }

  setHidden(elements.recentSection, false);

  const items = payload.items
    .map((entry) => entry?.track ? entry : { track: entry })
    .filter((entry) => entry?.track)
    .slice(0, 5);

  if (!items.length) {
    elements.recentRoot.innerHTML = `
      <div class="spotify-empty">
        No recent tracks are available right now.
      </div>
    `;
    return false;
  }

  elements.recentRoot.innerHTML = items.map((entry) => {
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

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Spotify returned invalid data");
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      `Spotify returned ${response.status}`
    );
  }

  return payload;
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
      fetchJson(`/api/public/now-playing/${encodeURIComponent(USERNAME)}`),
      fetchJson(`/api/public/recent-tracks/${encodeURIComponent(USERNAME)}`)
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

    // The individual section placeholders already explain missing data.
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
