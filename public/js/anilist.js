
import { CONFIG } from "./config.js";

const root = document.querySelector("#anilist-stats");

const PAGE_SIZE = 40;
const CACHE_VERSION = 4;
const CACHE_TTL = 10 * 60 * 1000;
const STALE_CACHE_TTL = 24 * 60 * 60 * 1000;
const REQUEST_GAP = 500;

let completedAll = [];
let completedPage = 1;
let completedSearch = "";
let completedFullyLoaded = false;
let lastRequestAt = 0;

const profileQuery = `
query AnimeProfile($name: String!) {
  User(name: $name) {
    id
    name
    createdAt
    siteUrl
    statistics {
      anime {
        count
        episodesWatched
        minutesWatched
        meanScore
        statuses {
          status
          count
        }
      }
    }
    favourites {
      characters(page: 1, perPage: 12) {
        nodes {
          id
          name {
            full
          }
          image {
            large
          }
          siteUrl
        }
      }
    }
  }
}
`;

const dashboardQuery = `
query AnimeDashboard($name: String!) {
  current: Page(page: 1, perPage: 50) {
    mediaList(
      userName: $name
      type: ANIME
      status: CURRENT
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }

  completed: Page(page: 1, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(
      userName: $name
      type: ANIME
      status: COMPLETED
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }

  planned: Page(page: 1, perPage: 50) {
    mediaList(
      userName: $name
      type: ANIME
      status: PLANNING
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }

  dropped: Page(page: 1, perPage: 50) {
    mediaList(
      userName: $name
      type: ANIME
      status: DROPPED
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }

  paused: Page(page: 1, perPage: 50) {
    mediaList(
      userName: $name
      type: ANIME
      status: PAUSED
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }

  repeating: Page(page: 1, perPage: 50) {
    mediaList(
      userName: $name
      type: ANIME
      status: REPEATING
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }
}
`;

const completedPageQuery = `
query CompletedAnime($name: String!, $page: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(
      userName: $name
      type: ANIME
      status: COMPLETED
      sort: UPDATED_TIME_DESC
    ) {
      progress
      score
      updatedAt
      media {
        id
        siteUrl
        title { english romaji }
        coverImage { large }
        episodes
        format
        season
        seasonYear
        averageScore
      }
    }
  }
}
`;

const activityQuery = `
query AnimeActivity($userId: Int!) {
  Page(page: 1, perPage: 50) {
    activities(
      userId: $userId
      type: ANIME_LIST
      sort: ID_DESC
    ) {
      ... on ListActivity {
        id
        status
        progress
        createdAt
        siteUrl
        media {
          id
          siteUrl
          title { english romaji }
          coverImage { large }
          format
          season
          seasonYear
        }
      }
    }
  }
}
`;

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function cacheKey(name) {
  return `hitboy-anilist-v${CACHE_VERSION}-${name}`;
}

function readCache(name, maximumAge = CACHE_TTL) {
  try {
    const raw = localStorage.getItem(cacheKey(name));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached?.savedAt || !("value" in cached)) return null;
    if (Date.now() - cached.savedAt > maximumAge) return null;

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
    // The page remains usable when storage is unavailable.
  }
}

async function waitForRequestSlot() {
  const elapsed = Date.now() - lastRequestAt;

  if (elapsed < REQUEST_GAP) {
    await sleep(REQUEST_GAP - elapsed);
  }

  lastRequestAt = Date.now();
}

async function post(
  queryText,
  variables,
  {
    cacheName = "",
    cacheAge = CACHE_TTL,
    retries = 2
  } = {}
) {
  if (cacheName) {
    const fresh = readCache(cacheName, cacheAge);
    if (fresh) return fresh;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await waitForRequestSlot();

    try {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          query: queryText,
          variables
        })
      });

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error(" returned invalid data");
      }

      if (response.status === 429) {
        const retryAfter = Number(
          response.headers.get("Retry-After")
        ) || 2;

        const error = new Error(
          " is temporarily rate limited"
        );

        error.retryAfter = retryAfter;
        error.rateLimited = true;
        throw error;
      }

      if (!response.ok || payload.errors?.length) {
        throw new Error(
          payload?.errors?.[0]?.message ||
          ` returned ${response.status}`
        );
      }

      if (cacheName) {
        writeCache(cacheName, payload.data);
      }

      return payload.data;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(
          error?.rateLimited
            ? error.retryAfter * 1000
            : 700 * (attempt + 1)
        );
      }
    }
  }

  if (cacheName) {
    const stale = readCache(cacheName, STALE_CACHE_TTL);
    if (stale) return stale;
  }

  throw lastError || new Error(" could not be reached");
}

async function loadProfile() {
  const data = await post(
    profileQuery,
    { name: CONFIG.anilistUsername },
    { cacheName: "profile" }
  );

  return data.User;
}

async function loadDashboard() {
  return post(
    dashboardQuery,
    { name: CONFIG.anilistUsername },
    { cacheName: "dashboard" }
  );
}

async function loadCompletedPage(page) {
  const data = await post(
    completedPageQuery,
    {
      name: CONFIG.anilistUsername,
      page
    },
    {
      cacheName: `completed-page-${page}`
    }
  );

  return data.Page || {
    mediaList: [],
    pageInfo: { hasNextPage: false }
  };
}

async function loadAllCompleted(firstPage) {
  const all = [...(firstPage?.mediaList || [])];
  let page = 2;
  let hasNextPage = Boolean(firstPage?.pageInfo?.hasNextPage);

  while (hasNextPage && page <= 20) {
    const result = await loadCompletedPage(page);
    all.push(...(result.mediaList || []));
    hasNextPage = Boolean(result.pageInfo?.hasNextPage);
    page += 1;
  }

  const unique = new Map();

  for (const entry of all) {
    const id = entry?.media?.id;
    if (id && !unique.has(id)) {
      unique.set(id, entry);
    }
  }

  return [...unique.values()];
}

async function loadRecentActivity(userId) {
  try {
    const data = await post(
      activityQuery,
      { userId },
      {
        cacheName: `activity-${userId}`,
        cacheAge: 5 * 60 * 1000,
        retries: 1
      }
    );

    return (data.Page?.activities || []).filter(
      (activity) => activity?.media
    );
  } catch (error) {
    console.warn("Recent activity could not load:", error);
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleOf(media) {
  return (
    media?.title?.english ||
    media?.title?.romaji ||
    "Unknown Anime"
  );
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function seasonOf(media) {
  const season = media?.season
    ? media.season.charAt(0) +
      media.season.slice(1).toLowerCase()
    : "";

  return [season, media?.seasonYear]
    .filter(Boolean)
    .join(" ");
}

function dateOf(timestamp) {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit"
  }).format(new Date(timestamp * 1000));
}

function officialStatusCount(user, status) {
  const statuses = user?.statistics?.anime?.statuses || [];
  return Number(
    statuses.find((entry) => entry?.status === status)?.count
  ) || 0;
}

function sectionHeader(title, count = "") {
  return `
    <div class="section-header">
      <h4>${escapeHtml(title)}</h4>
      ${count !== ""
        ? `<span class="section-count">(${escapeHtml(count)})</span>`
        : ""
      }
    </div>
  `;
}

function statsBar(user) {
  const stats = user?.statistics?.anime || {};

  const values = [
    [((Number(stats.minutesWatched) || 0) / 1440).toFixed(1), "Days Watched"],
    [(Number(stats.episodesWatched) || 0).toLocaleString(), "Episodes"],
    [(Number(stats.meanScore) || 0).toFixed(1), "Mean Score"],
    [(Number(stats.count) || 0).toLocaleString(), "Total Anime"],
    [officialStatusCount(user, "COMPLETED").toLocaleString(), "Completed"],
    [officialStatusCount(user, "CURRENT").toLocaleString(), "Watching"],
    [officialStatusCount(user, "PAUSED").toLocaleString(), "Paused"],
    [officialStatusCount(user, "DROPPED").toLocaleString(), "Dropped"],
    [officialStatusCount(user, "PLANNING").toLocaleString(), "Planning"],
    [officialStatusCount(user, "REPEATING").toLocaleString(), "Rewatching"]
  ];

  return `
    <div class="stats-bar">
      ${values.map(([value, label]) => `
        <div class="stats-bar-item">
          <span class="stats-bar-value">${escapeHtml(value)}</span>
          <span class="stats-bar-label">${escapeHtml(label)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function characterSection(characters) {
  if (!characters.length) return "";

  return `
    <section>
      ${sectionHeader("Favorite Characters", characters.length)}
      <div class="anime-grid character-grid">
        ${characters.map((character) => `
          <a
            class="anime-grid-item"
            href="${escapeHtml(character.siteUrl || "#")}"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="anime-grid-cover">
              <img
                src="${escapeHtml(character.image?.large || "")}"
                alt="${escapeHtml(character.name?.full || "")}"
                loading="lazy"
              >
            </div>
            <div class="anime-grid-info">
              <div class="anime-grid-title">
                ${escapeHtml(character.name?.full || "")}
              </div>
            </div>
          </a>
        `).join("")}
      </div>
    </section>
  `;
}

function currentCard(entry) {
  const media = entry.media;
  const progress = Number(entry.progress) || 0;
  const episodes = Number(media?.episodes) || 0;
  const percent = episodes > 0
    ? Math.min(100, progress / episodes * 100)
    : 0;

  return `
    <a
      class="anime-card"
      href="${escapeHtml(media?.siteUrl || "#")}"
      target="_blank"
      rel="noopener noreferrer"
    >
      <div class="anime-card-cover">
        <img
          src="${escapeHtml(media?.coverImage?.large || "")}"
          alt="${escapeHtml(titleOf(media))}"
          loading="lazy"
        >
        <div class="anime-card-overlay">
          <div class="anime-card-progress">
            <div
              class="anime-card-progress-fill"
              style="width:${percent}%"
            ></div>
          </div>
          <div class="anime-card-episodes">
            <span class="current">${progress}</span>
            ${episodes ? ` / ${episodes}` : ""} Episodes
          </div>
        </div>
      </div>

      <div class="anime-card-info">
        <div class="anime-card-title">
          ${escapeHtml(titleOf(media))}
        </div>
        <div class="anime-card-meta">
          <span>${escapeHtml(media?.format || "")}</span>
          <span>${escapeHtml(seasonOf(media))}</span>
          ${media?.averageScore
            ? `<span><span class="star">★</span> ${(media.averageScore / 10).toFixed(1)}</span>`
            : ""
          }
        </div>
      </div>
    </a>
  `;
}

function gridCard(entry) {
  const media = entry.media;

  return `
    <a
      class="anime-grid-item"
      href="${escapeHtml(media?.siteUrl || "#")}"
      target="_blank"
      rel="noopener noreferrer"
    >
      <div class="anime-grid-cover">
        <img
          src="${escapeHtml(media?.coverImage?.large || "")}"
          alt="${escapeHtml(titleOf(media))}"
          loading="lazy"
        >
        ${entry.score
          ? `<div class="anime-grid-score-badge"><span>★</span> ${escapeHtml(entry.score)}</div>`
          : ""
        }
        ${entry.updatedAt
          ? `<div class="anime-grid-date-badge">${escapeHtml(dateOf(entry.updatedAt))}</div>`
          : ""
        }
      </div>

      <div class="anime-grid-info">
        <div class="anime-grid-title">
          ${escapeHtml(titleOf(media))}
        </div>
        <div class="anime-grid-meta">
          <span>${escapeHtml(media?.format || "")}</span>
          <span>${escapeHtml(seasonOf(media))}</span>
        </div>
      </div>
    </a>
  `;
}

function activityLabel(activity) {
  const status = String(activity?.status || "").toLowerCase();

  if (status.includes("completed")) return "Completed";
  if (status.includes("watched episode")) return "Watching";
  if (status.includes("dropped")) return "Dropped";
  if (status.includes("paused")) return "Paused";
  if (status.includes("plans to watch")) return "Planning";
  if (status.includes("rewatched")) return "Rewatching";

  return activity?.status || "Updated";
}

function groupActivity(activities) {
  const grouped = new Map();

  for (const activity of activities) {
    const id = activity?.media?.id;
    if (!id) continue;

    const existing = grouped.get(id);

    if (
      !existing ||
      Number(activity.createdAt) > Number(existing.createdAt)
    ) {
      grouped.set(id, activity);
    }
  }

  return [...grouped.values()]
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    ;
}

function recentActivitySection(activities) {
  const grouped = groupActivity(activities);

  if (!grouped.length) return "";

  return `
    <section class="recent-activity-section">
      ${sectionHeader("Recent Activity", grouped.length)}
      <div class="activity-grid">
        ${grouped.map((activity) => {
          const media = activity.media;

          return `
            <a
              class="activity-card"
              href="${escapeHtml(activity.siteUrl || media.siteUrl || "#")}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div class="activity-cover">
                <img
                  src="${escapeHtml(media.coverImage?.large || "")}"
                  alt="${escapeHtml(titleOf(media))}"
                  loading="lazy"
                >
                <div class="activity-date">
                  ${escapeHtml(dateOf(activity.createdAt))}
                </div>
              </div>

              <div class="activity-info">
                <div class="activity-title">
                  ${escapeHtml(titleOf(media))}
                </div>
                <div class="activity-meta">
                  <span class="activity-status">
                    ${escapeHtml(activityLabel(activity))}
                  </span>
                  ${activity.progress
                    ? `<span>${escapeHtml(activity.progress)}</span>`
                    : ""
                  }
                  <span>${escapeHtml(media.format || "")}</span>
                </div>
              </div>
            </a>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function simpleSection(title, entries) {
  if (!entries.length) return "";

  return `
    <section>
      ${sectionHeader(title, entries.length)}
      <div class="anime-grid">
        ${entries.map(gridCard).join("")}
      </div>
    </section>
  `;
}

function completedSection(user) {
  const total = officialStatusCount(user, "COMPLETED");

  return `
    <section id="completed-section">
      ${sectionHeader(
        "Completed Anime",
        total.toLocaleString()
      )}

      <div class="anime-list-note" id="completed-list-note">
        Showing ${completedAll.length.toLocaleString()} loaded entries.
        Search loads the full completed list when needed.
      </div>

      <div class="anime-search">
        <input
          type="search"
          id="anime-search-input"
          class="search-input"
          placeholder="Search all completed anime..."
          autocomplete="off"
        >
      </div>

      <div class="anime-grid" id="completed-grid"></div>
      <div class="pagination" id="completed-pagination"></div>
    </section>
  `;
}

function updateCompletedListNote() {
  const note = document.querySelector("#completed-list-note");

  if (!note) return;

  note.textContent = completedFullyLoaded
    ? `All ${completedAll.length.toLocaleString()} completed entries loaded.`
    : `Showing ${completedAll.length.toLocaleString()} loaded entries. Search loads the full completed list when needed.`;
}

function filteredCompleted() {
  const search = normalizeSearch(completedSearch);

  if (!search) return completedAll;

  return completedAll.filter((entry) => {
    const media = entry.media;

    return [
      titleOf(media),
      media?.title?.english,
      media?.title?.romaji
    ].some((title) =>
      normalizeSearch(title).includes(search)
    );
  });
}

function renderCompleted() {
  updateCompletedListNote();
  const grid = document.querySelector("#completed-grid");
  const pagination = document.querySelector("#completed-pagination");

  if (!grid || !pagination) return;

  const filtered = filteredCompleted();
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PAGE_SIZE)
  );

  completedPage = Math.min(
    Math.max(1, completedPage),
    totalPages
  );

  const start = (completedPage - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE);

  grid.innerHTML = items.length
    ? items.map(gridCard).join("")
    : `<div class="notice">No completed anime match your search.</div>`;

  pagination.innerHTML = `
    <button
      class="pagination-btn"
      type="button"
      data-page="${completedPage - 1}"
      ${completedPage <= 1 ? "disabled" : ""}
    >
      Previous
    </button>

    <span class="pagination-info">
      Page ${completedPage} of ${totalPages}
    </span>

    <button
      class="pagination-btn"
      type="button"
      data-page="${completedPage + 1}"
      ${completedPage >= totalPages ? "disabled" : ""}
    >
      Next
    </button>
  `;

  pagination.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      completedPage = Number(button.dataset.page);
      renderCompleted();

      document.querySelector("#completed-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
}

function profileSection(user) {
  return `
    <section>
      ${sectionHeader("Profile")}

      <div class="profile-stats">
        <div class="profile-stat">
          <span class="profile-label">Username</span>
          <span class="profile-value">${escapeHtml(user.name)}</span>
        </div>

        <div class="profile-stat">
          <span class="profile-label">Member Since</span>
          <span class="profile-value">
            ${escapeHtml(
              new Intl.DateTimeFormat("en-US").format(
                new Date(user.createdAt * 1000)
              )
            )}
          </span>
        </div>

        <div class="profile-stat">
          <span class="profile-label"></span>
          <a
            class="profile-value profile-link"
            href="${escapeHtml(user.siteUrl)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Profile
          </a>
        </div>
      </div>
    </section>
  `;
}

async function ensureAllCompleted(firstPage) {
  if (completedFullyLoaded) return;

  completedAll = await loadAllCompleted(firstPage);
  completedFullyLoaded = true;
}



function activityEpisodeText(activity) {
  const rawStatus = String(activity?.status || "");
  const progress = String(activity?.progress || "").trim();

  if (/completed/i.test(rawStatus)) {
    return "Completed";
  }

  if (/dropped/i.test(rawStatus)) {
    return progress ? `Dropped at ${progress}` : "Dropped";
  }

  if (/paused/i.test(rawStatus)) {
    return progress ? `Paused at ${progress}` : "Paused";
  }

  if (/plans to watch/i.test(rawStatus)) {
    return "Added to Plan to Watch";
  }

  if (/rewatched/i.test(rawStatus)) {
    return progress ? `Rewatched ${progress}` : "Rewatching";
  }

  if (/watched episode/i.test(rawStatus)) {
    if (progress) {
      return /^episode/i.test(progress)
        ? `Watched ${progress}`
        : `Watched episode ${progress}`;
    }

    const match = rawStatus.match(/watched episode\s*(.+)$/i);
    if (match?.[1]) {
      return `Watched episode ${match[1]}`;
    }

    return "Watched an episode";
  }

  return progress
    ? `${rawStatus || "Updated"} ${progress}`.trim()
    : (rawStatus || "Updated");
}

function activityMediaMeta(media) {
  const parts = [];

  if (media?.format) {
    parts.push(media.format);
  }

  const season = seasonOf(media);
  if (season) {
    parts.push(season);
  }

  return parts.join(" • ");
}

function groupedRecentActivity(activities) {
  const map = new Map();

  for (const activity of activities || []) {
    const mediaId = activity?.media?.id;

    if (!mediaId) continue;

    const existing = map.get(mediaId);

    if (
      !existing ||
      Number(activity.createdAt) > Number(existing.createdAt)
    ) {
      map.set(mediaId, activity);
    }
  }

  return [...map.values()]
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    ;
}

function recentActivityStatus(activity) {
  const status = String(activity?.status || "").toLowerCase();

  if (status.includes("completed")) return "Completed";
  if (status.includes("watched episode")) return "Watching";
  if (status.includes("dropped")) return "Dropped";
  if (status.includes("paused")) return "Paused";
  if (status.includes("plans to watch")) return "Planning";
  if (status.includes("rewatched")) return "Rewatching";

  return activity?.status || "Updated";
}

function closeRecentActivityModal() {
  document.querySelector("#recent-activity-modal")
    ?.classList.remove("open");

  document.querySelector("#recent-activity-backdrop")
    ?.classList.remove("open");

  document.querySelector("#recent-activity-button")
    ?.setAttribute("aria-expanded", "false");

  document.body.classList.remove("recent-activity-open");
}

function openRecentActivityModal() {
  document.querySelector("#recent-activity-modal")
    ?.classList.add("open");

  document.querySelector("#recent-activity-backdrop")
    ?.classList.add("open");

  document.querySelector("#recent-activity-button")
    ?.setAttribute("aria-expanded", "true");

  document.body.classList.add("recent-activity-open");
}

function removeRecentActivityUi() {
  document.querySelector("#recent-activity-button")?.remove();
  document.querySelector("#recent-activity-modal")?.remove();
  document.querySelector("#recent-activity-backdrop")?.remove();
  document.body.classList.remove("recent-activity-open");
}

function mountRecentActivityButton(activities) {
  removeRecentActivityUi();

  const grouped = groupedRecentActivity(activities);

  if (!grouped.length) return;

  const backdrop = document.createElement("button");
  backdrop.id = "recent-activity-backdrop";
  backdrop.className = "recent-activity-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close recent activity");
  backdrop.addEventListener("click", closeRecentActivityModal);

  const modal = document.createElement("section");
  modal.id = "recent-activity-modal";
  modal.className = "recent-activity-modal";
  
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Recent Activity");
  modal.innerHTML = `
    <div class="recent-activity-modal-header">
      <div>
        
        <h2>Recent Activity</h2>
      </div>

      <button
        class="recent-activity-close"
        type="button"
        aria-label="Close recent activity"
      >
        ×
      </button>
    </div>

    <div class="recent-activity-modal-list">
      ${grouped.map((activity) => {
        const media = activity.media;

        return `
          <a
            class="recent-activity-modal-item"
            href="${escapeHtml(activity.siteUrl || media.siteUrl || "#")}"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="${escapeHtml(media.coverImage?.large || "")}"
              alt="${escapeHtml(titleOf(media))}"
              loading="lazy"
            >

            <span class="recent-activity-copy">
              <strong>${escapeHtml(titleOf(media))}</strong>
              <small class="recent-activity-primary">
                ${escapeHtml(activityEpisodeText(activity))}
              </small>
              ${activityMediaMeta(media)
                ? `<small class="recent-activity-meta">${escapeHtml(activityMediaMeta(media))}</small>`
                : ""
              }
              <time>${escapeHtml(dateOf(activity.createdAt))}</time>
            </span>
          </a>
        `;
      }).join("")}
    </div>
  `;

  modal.querySelector(".recent-activity-close")
    ?.addEventListener("click", closeRecentActivityModal);

  const button = document.createElement("button");
  button.id = "recent-activity-button";
  button.className = "recent-activity-button";
  button.type = "button";
  button.setAttribute("aria-label", `Open ${grouped.length} recent activity items`);
  button.setAttribute("aria-controls", "recent-activity-modal");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="8"></circle>
      <path d="M12 8v4l3 2"></path>
    </svg>

    <span>${grouped.length}</span>
  `;

  button.addEventListener("click", () => {
    const modalIsOpen = modal.classList.contains("open");

    if (modalIsOpen) {
      closeRecentActivityModal();
    } else {
      openRecentActivityModal();
    }
  });

  document.body.append(backdrop, modal, button);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRecentActivityModal();
  }
});

async function loadAnime() {
  if (!root) return;

  root.innerHTML = `
    <div class="loading-spinner">
      Loading anime stats...
    </div>
  `;

  try {
    const [user, dashboard] = await Promise.all([
      loadProfile(),
      loadDashboard()
    ]);

    if (!user) {
      throw new Error(
        ` user ${CONFIG.anilistUsername} was not found`
      );
    }

    const current = dashboard.current?.mediaList || [];
    const planned = dashboard.planned?.mediaList || [];
    const dropped = dashboard.dropped?.mediaList || [];
    const firstCompleted = dashboard.completed || {
      mediaList: [],
      pageInfo: { hasNextPage: false }
    };

    completedAll = firstCompleted.mediaList || [];
    completedFullyLoaded = !firstCompleted.pageInfo?.hasNextPage;

    const characters = user.favourites?.characters?.nodes || [];

    root.innerHTML = `
      ${statsBar(user)}
      ${characterSection(characters)}

      ${current.length ? `
        <section>
          ${sectionHeader("Currently Watching", current.length)}
          <div class="anime-carousel">
            ${current.map(currentCard).join("")}
          </div>
        </section>
      ` : ""}

      ${completedSection(user)}
      ${simpleSection("Plan to Watch", planned)}
      ${simpleSection("Dropped", dropped)}
      ${profileSection(user)}
    `;

    renderCompleted();

    const search = document.querySelector("#anime-search-input");

    search?.addEventListener("input", async (event) => {
      completedSearch = event.target.value;
      completedPage = 1;

      if (completedSearch.trim() && !completedFullyLoaded) {
        search.disabled = true;
        search.placeholder = "Loading all completed anime...";

        try {
          await ensureAllCompleted(firstCompleted);
        } catch (error) {
          console.warn(
            "Could not load the full completed list:",
            error
          );
        } finally {
          search.disabled = false;
          search.placeholder = "Search all completed anime...";
        }
      }

      renderCompleted();
    });

    // Recent activity is delayed so it cannot slow or break the main page.
    window.setTimeout(async () => {
      const activities = await loadRecentActivity(user.id);
      mountRecentActivityButton(activities);
    }, 1000);
  } catch (error) {
    removeRecentActivityUi();
    root.innerHTML = `
      <div class="notice error">
        <strong>Anime stats could not load.</strong><br>
        ${escapeHtml(error.message)}.<br>
        <a
          href="${escapeHtml(CONFIG.anilistUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open  directly
        </a>
      </div>
    `;
  }
}

loadAnime();
