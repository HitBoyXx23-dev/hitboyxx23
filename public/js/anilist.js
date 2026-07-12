import { CONFIG } from "./config.js";

const root = document.querySelector("#anilist-stats");

const PAGE_SIZE = 40;
const CACHE_VERSION = 4;
const CACHE_TTL = 10 * 60 * 1000;
const STALE_CACHE_TTL = 24 * 60 * 60 * 1000;
const REQUEST_GAP = 500;

let completedAll = [];
let plannedAll = [];
let droppedAll = [];
let completedPage = 1;
let completedSearch = "";
let lastRequestAt = 0;
let animeModalMounted = false;
let characterModalMounted = false;
const mediaLookup = new Map();
const characterLookup = new Map();

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
            native
            alternative
          }
          image {
            large
          }
          description
          dateOfBirth {
            month
            day
          }
          age
          gender
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
      }
    }
  }

  planned: Page(page: 1, perPage: 50) {
    pageInfo {
      hasNextPage
    }
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
      }
    }
  }

  dropped: Page(page: 1, perPage: 50) {
    pageInfo {
      hasNextPage
    }
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
      }
    }
  }
}
`;

const listPageQuery = `
query AnimeList($name: String!, $status: MediaListStatus!, $page: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(
      userName: $name
      type: ANIME
      status: $status
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
        duration
        format
        status
        season
        seasonYear
        averageScore
        genres
        source
        description
        startDate { year month day }
        endDate { year month day }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        trailer {
          id
          site
        }
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
    return;
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

async function loadListPage(status, page) {
  const data = await post(
    listPageQuery,
    {
      name: CONFIG.anilistUsername,
      status,
      page
    },
    {
      cacheName: `list-${status}-${page}`
    }
  );

  return data.Page || {
    mediaList: [],
    pageInfo: { hasNextPage: false }
  };
}

async function loadAllForStatus(status, firstPage) {
  const all = [...(firstPage?.mediaList || [])];
  let page = 2;
  let hasNextPage = Boolean(firstPage?.pageInfo?.hasNextPage);

  while (hasNextPage && page <= 20) {
    const result = await loadListPage(status, page);
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

function formatStatus(status) {
  const labels = {
    FINISHED: "Finished",
    RELEASING: "Releasing",
    NOT_YET_RELEASED: "Not Yet Released",
    CANCELLED: "Cancelled",
    HIATUS: "Hiatus"
  };

  return labels[status] || "";
}

function formatSource(source) {
  return String(source || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function formatFuzzyDate(date) {
  if (!date?.year) return "";
  if (!date?.month || !date?.day) return String(date.year);

  return `${date.month}/${date.day}/${date.year}`;
}

function stripDescription(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?i>/gi, "")
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function studiosOf(media) {
  return (media?.studios?.nodes || [])
    .map((studio) => studio?.name)
    .filter(Boolean)
    .join(", ");
}

function trailerUrl(media) {
  const trailer = media?.trailer;
  if (!trailer?.id) return "";

  if (trailer.site === "youtube") {
    return `https://www.youtube.com/watch?v=${trailer.id}`;
  }

  if (trailer.site === "dailymotion") {
    return `https://www.dailymotion.com/video/${trailer.id}`;
  }

  return "";
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatBirthday(dateOfBirth) {
  if (!dateOfBirth?.month || !dateOfBirth?.day) return "";
  return `${MONTH_NAMES[dateOfBirth.month - 1]} ${dateOfBirth.day}`;
}

function alternateNamesOf(character) {
  return [
    character?.name?.native,
    ...(character?.name?.alternative || [])
  ].filter(Boolean).join(", ");
}

function formatCharacterDescription(raw) {
  const links = [];

  const withPlaceholders = String(raw || "")
    .replace(/~!([\s\S]*?)!~/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const token = `@@LINK${links.length}@@`;

      links.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#7fa3ff;text-decoration:underline;">${escapeHtml(label)}</a>`
      );

      return token;
    });

  let html = escapeHtml(withPlaceholders)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/(\r?\n){2,}/g, "<br><br>")
    .replace(/\r?\n/g, " ");

  links.forEach((linkHtml, index) => {
    html = html.replace(`@@LINK${index}@@`, linkHtml);
  });

  return html;
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

  characters.forEach((character) => {
    if (character?.id) {
      characterLookup.set(String(character.id), character);
    }
  });

  return `
    <section>
      ${sectionHeader("Favorite Characters", characters.length)}
      <div class="anime-grid character-grid">
        ${characters.map((character) => `
          <a
            class="anime-grid-item"
            href="${escapeHtml(character.siteUrl || "#")}"
            data-character-id="${escapeHtml(character?.id ?? "")}"
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

  if (media?.id) {
    mediaLookup.set(String(media.id), { entry, media });
  }

  return `
    <a
      class="anime-card"
      href="${escapeHtml(media?.siteUrl || "#")}"
      data-media-id="${escapeHtml(media?.id ?? "")}"
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

  if (media?.id) {
    mediaLookup.set(String(media.id), { entry, media });
  }

  return `
    <a
      class="anime-grid-item"
      href="${escapeHtml(media?.siteUrl || "#")}"
      data-media-id="${escapeHtml(media?.id ?? "")}"
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
          ? `<div class="anime-grid-date-badge" style="font-size:13px;">${escapeHtml(dateOf(entry.updatedAt))}</div>`
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
                <div class="activity-date" style="font-size:13px;">
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
              <time style="font-size:13px;">${escapeHtml(dateOf(activity.createdAt))}</time>
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

function detailBadge(text) {
  return `<span style="background:#1c1c22;color:#c7c7ce;padding:4px 10px;border-radius:4px;font-size:12px;white-space:nowrap;border:1px solid #2a2a30;">${escapeHtml(text)}</span>`;
}

function detailGenrePill(text) {
  return `<span style="background:#4169e1;color:#f2f2f6;padding:4px 10px;border-radius:4px;font-size:12px;">${escapeHtml(text)}</span>`;
}

function animeModalContent(record) {
  const entry = record.entry;
  const media = record.media;

  const badges = [
    media.format,
    formatStatus(media.status),
    seasonOf(media),
    media.episodes ? `${media.episodes} eps` : "",
    media.duration ? `${media.duration} min` : ""
  ].filter(Boolean);

  const infoBadges = [];
  const studios = studiosOf(media);
  const source = formatSource(media.source);

  if (studios) infoBadges.push(`studio: ${studios}`);
  if (source) infoBadges.push(`source: ${source}`);

  const progressText = entry
    ? `progress: ${Number(entry.progress) || 0}${media.episodes ? ` / ${media.episodes}` : ""}`
    : "";

  const aired = [
    formatFuzzyDate(media.startDate),
    formatFuzzyDate(media.endDate)
  ].filter(Boolean).join(" – ");

  const genres = (media.genres || []).slice(0, 5);
  const trailer = trailerUrl(media);

  return `
    <button
      data-close
      type="button"
      aria-label="Close"
      style="position:absolute;top:16px;right:16px;background:none;border:none;color:#8a8a92;font-size:22px;line-height:1;cursor:pointer;"
    >×</button>

    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      <img
        src="${escapeHtml(media.coverImage?.large || "")}"
        alt="${escapeHtml(titleOf(media))}"
        style="width:140px;border-radius:6px;flex-shrink:0;"
      >

      <div style="flex:1;min-width:200px;">
        <h2 style="margin:0 0 10px;font-size:22px;color:#f2f2f6;">
          ${escapeHtml(titleOf(media))}
        </h2>

        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${badges.map(detailBadge).join("")}
        </div>

        ${media.averageScore ? `
          <div style="margin-top:10px;font-size:14px;">
            <span style="color:#f5c518;">★</span>
            <strong style="color:#f2f2f6;">${(media.averageScore / 10).toFixed(1)}</strong>
            <span style="color:#8a8a92;">(average)</span>
          </div>
        ` : ""}

        ${infoBadges.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
            ${infoBadges.map(detailBadge).join("")}
          </div>
        ` : ""}

        ${progressText ? `
          <div style="margin-top:10px;">
            ${detailBadge(progressText)}
          </div>
        ` : ""}

        ${aired ? `
          <div style="margin-top:10px;font-size:13px;color:#8a8a92;">
            aired: ${escapeHtml(aired)}
          </div>
        ` : ""}

        ${genres.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
            ${genres.map(detailGenrePill).join("")}
          </div>
        ` : ""}
      </div>
    </div>

    ${media.description ? `
      <hr style="border:none;border-top:1px solid #2a2a30;margin:20px 0;">
      <p style="font-size:14px;line-height:1.6;color:#c7c7ce;margin:0;">
        ${escapeHtml(stripDescription(media.description))}
      </p>
    ` : ""}

    <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">
      <a
        href="${escapeHtml(media.siteUrl || "#")}"
        target="_blank"
        rel="noopener noreferrer"
        style="flex:1;min-width:120px;text-align:center;background:#4169e1;color:#fff;padding:10px 16px;border-radius:4px;font-weight:600;text-decoration:none;font-size:14px;"
      >view on anilist</a>

      ${trailer ? `
        <a
          href="${escapeHtml(trailer)}"
          target="_blank"
          rel="noopener noreferrer"
          style="flex:1;min-width:120px;text-align:center;background:#4169e1;color:#fff;padding:10px 16px;border-radius:4px;font-weight:600;text-decoration:none;font-size:14px;"
        >trailer</a>
      ` : ""}

      <button
        data-close
        type="button"
        style="flex:0 0 auto;background:#1c1c22;color:#c7c7ce;padding:10px 16px;border-radius:4px;font-weight:600;border:1px solid #2a2a30;cursor:pointer;font-size:14px;"
      >close</button>
    </div>
  `;
}

function ensureAnimeModalMounted() {
  if (animeModalMounted) return;
  animeModalMounted = true;

  const backdrop = document.createElement("button");
  backdrop.id = "anime-detail-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close anime details");
  backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);border:none;padding:0;margin:0;cursor:pointer;z-index:998;display:none;";
  backdrop.addEventListener("click", closeAnimeModal);

  const modal = document.createElement("section");
  modal.id = "anime-detail-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:92%;max-width:600px;max-height:88vh;overflow-y:auto;background:#121216;border:1px solid #2a2a30;border-radius:8px;padding:24px;z-index:999;display:none;color:#e6e6ec;box-shadow:0 20px 60px rgba(0,0,0,.5);";

  document.body.append(backdrop, modal);
}

function closeAnimeModal() {
  document.querySelector("#anime-detail-modal")
    ?.style.setProperty("display", "none");

  document.querySelector("#anime-detail-backdrop")
    ?.style.setProperty("display", "none");

  document.body.classList.remove("anime-detail-open");
}

function openAnimeModal(id) {
  const record = mediaLookup.get(String(id));
  if (!record) return;

  ensureAnimeModalMounted();

  const modal = document.querySelector("#anime-detail-modal");
  const backdrop = document.querySelector("#anime-detail-backdrop");
  if (!modal || !backdrop) return;

  modal.innerHTML = animeModalContent(record);

  modal.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", closeAnimeModal);
  });

  modal.style.display = "block";
  backdrop.style.display = "block";
  document.body.classList.add("anime-detail-open");
}

function characterModalContent(character) {
  const badges = [
    formatBirthday(character.dateOfBirth) ? `birthday: ${formatBirthday(character.dateOfBirth)}` : "",
    character.age ? `initial age: ${character.age}` : "",
    character.gender ? `gender: ${character.gender}` : ""
  ].filter(Boolean);

  const alternateNames = alternateNamesOf(character);

  return `
    <button
      data-close
      type="button"
      aria-label="Close"
      style="position:absolute;top:16px;right:16px;background:none;border:none;color:#8a8a92;font-size:22px;line-height:1;cursor:pointer;"
    >×</button>

    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      <img
        src="${escapeHtml(character.image?.large || "")}"
        alt="${escapeHtml(character.name?.full || "")}"
        style="width:140px;border-radius:6px;flex-shrink:0;"
      >

      <div style="flex:1;min-width:200px;">
        <h2 style="margin:0 0 10px;font-size:22px;color:#f2f2f6;">
          ${escapeHtml(character.name?.full || "")}
        </h2>

        ${alternateNames ? `
          <div style="margin-bottom:10px;">
            ${detailBadge(alternateNames)}
          </div>
        ` : ""}

        ${badges.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${badges.map(detailBadge).join("")}
          </div>
        ` : ""}
      </div>
    </div>

    ${character.description ? `
      <hr style="border:none;border-top:1px solid #2a2a30;margin:20px 0;">
      <p style="font-size:14px;line-height:1.6;color:#c7c7ce;margin:0;">
        ${formatCharacterDescription(character.description)}
      </p>
    ` : ""}

    <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">
      <a
        href="${escapeHtml(character.siteUrl || "#")}"
        target="_blank"
        rel="noopener noreferrer"
        style="flex:1;min-width:120px;text-align:center;background:#4169e1;color:#fff;padding:10px 16px;border-radius:4px;font-weight:600;text-decoration:none;font-size:14px;"
      >view on anilist</a>

      <button
        data-close
        type="button"
        style="flex:0 0 auto;background:#1c1c22;color:#c7c7ce;padding:10px 16px;border-radius:4px;font-weight:600;border:1px solid #2a2a30;cursor:pointer;font-size:14px;"
      >close</button>
    </div>
  `;
}

function ensureCharacterModalMounted() {
  if (characterModalMounted) return;
  characterModalMounted = true;

  const backdrop = document.createElement("button");
  backdrop.id = "character-detail-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close character details");
  backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);border:none;padding:0;margin:0;cursor:pointer;z-index:998;display:none;";
  backdrop.addEventListener("click", closeCharacterModal);

  const modal = document.createElement("section");
  modal.id = "character-detail-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:92%;max-width:600px;max-height:88vh;overflow-y:auto;background:#121216;border:1px solid #2a2a30;border-radius:8px;padding:24px;z-index:999;display:none;color:#e6e6ec;box-shadow:0 20px 60px rgba(0,0,0,.5);";

  document.body.append(backdrop, modal);
}

function closeCharacterModal() {
  document.querySelector("#character-detail-modal")
    ?.style.setProperty("display", "none");

  document.querySelector("#character-detail-backdrop")
    ?.style.setProperty("display", "none");

  document.body.classList.remove("character-detail-open");
}

function openCharacterModal(id) {
  const character = characterLookup.get(String(id));
  if (!character) return;

  ensureCharacterModalMounted();

  const modal = document.querySelector("#character-detail-modal");
  const backdrop = document.querySelector("#character-detail-backdrop");
  if (!modal || !backdrop) return;

  modal.innerHTML = characterModalContent(character);

  modal.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", closeCharacterModal);
  });

  modal.style.display = "block";
  backdrop.style.display = "block";
  document.body.classList.add("character-detail-open");
}

document.addEventListener("click", (event) => {
  const characterTrigger = event.target.closest("[data-character-id]");

  if (characterTrigger && root?.contains(characterTrigger)) {
    const id = characterTrigger.dataset.characterId;
    if (!id) return;

    event.preventDefault();
    openCharacterModal(id);
    return;
  }

  const trigger = event.target.closest("[data-media-id]");
  if (!trigger) return;
  if (!root?.contains(trigger)) return;

  const id = trigger.dataset.mediaId;
  if (!id) return;

  event.preventDefault();
  openAnimeModal(id);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRecentActivityModal();
    closeAnimeModal();
    closeCharacterModal();
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

    const firstCompleted = dashboard.completed || {
      mediaList: [],
      pageInfo: { hasNextPage: false }
    };

    const firstPlanned = dashboard.planned || {
      mediaList: [],
      pageInfo: { hasNextPage: false }
    };

    const firstDropped = dashboard.dropped || {
      mediaList: [],
      pageInfo: { hasNextPage: false }
    };

    [completedAll, plannedAll, droppedAll] = await Promise.all([
      loadAllForStatus("COMPLETED", firstCompleted),
      loadAllForStatus("PLANNING", firstPlanned),
      loadAllForStatus("DROPPED", firstDropped)
    ]);

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
      ${simpleSection("Plan to Watch", plannedAll)}
      ${simpleSection("Dropped", droppedAll)}
      ${profileSection(user)}
    `;

    renderCompleted();

    const search = document.querySelector("#anime-search-input");

    search?.addEventListener("input", (event) => {
      completedSearch = event.target.value;
      completedPage = 1;
      renderCompleted();
    });

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
