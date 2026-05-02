import { Tweet, TweetSearchOptions, SortOption } from "../shared/types"
import { Message } from "../shared/messaging"

// DOM refs
const scanBtn      = document.getElementById("scan-btn")      as HTMLButtonElement
const clearBtn     = document.getElementById("clear-btn")     as HTMLButtonElement
const statusEl     = document.getElementById("status")        as HTMLSpanElement
const progressEl   = document.getElementById("progress")      as HTMLSpanElement
const queryInput   = document.getElementById("query")         as HTMLInputElement
const authorInput  = document.getElementById("author")        as HTMLInputElement
const sortSelect   = document.getElementById("sort")          as HTMLSelectElement
const mediaCheck   = document.getElementById("has-media")     as HTMLInputElement
const dateFrom     = document.getElementById("date-from")     as HTMLInputElement
const dateTo       = document.getElementById("date-to")       as HTMLInputElement
const tweetList    = document.getElementById("tweet-list")    as HTMLDivElement
const countEl      = document.getElementById("tweet-count")   as HTMLSpanElement

// State
let isScanning = false
let refreshTimer = 0

// Helpers
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function setScanState(scanning: boolean) {
  isScanning = scanning
  scanBtn.textContent = scanning ? "Stop Scan" : "Start Scan"
  scanBtn.classList.toggle("scanning", scanning)
  statusEl.textContent = scanning ? "Scanning…" : "Idle"
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Render Tweets Function 
function renderTweets(tweets: Tweet[]) {
  countEl.textContent = `${tweets.length} tweet${tweets.length !== 1 ? "s" : ""}`
  tweetList.innerHTML = ""

  if (tweets.length === 0) {
    tweetList.innerHTML = '<p class="empty">No tweets found.</p>'
    return
  }

  for (const t of tweets) {
    const card = document.createElement("div")
    card.className = "tweet-card"
    card.innerHTML = `
      <div class="tweet-header">
        <span class="display-name">${escHtml(t.author.displayName)}</span>
        <span class="username">@${escHtml(t.author.username)}</span>
        ${t.author.verified ? '<span class="verified">✓</span>' : ""}
        <span class="date">${fmtDate(t.timestamp)}</span>
      </div>
      <p class="tweet-text">${escHtml(t.text)}</p>
      <div class="tweet-stats">
        <span title="Replies">💬 ${fmtNum(t.replies)}</span>
        <span title="Retweets">🔁 ${fmtNum(t.retweets)}</span>
        <span title="Likes">❤️ ${fmtNum(t.likes)}</span>
        <span title="Views">👁 ${fmtNum(t.views)}</span>
        ${t.media?.length ? `<span title="Has media">🖼 ${t.media.length}</span>` : ""}
      </div>
      <a class="tweet-link" href="${t.url}" target="_blank" rel="noopener">Open tweet ↗</a>
    `
    tweetList.appendChild(card)
  }
}

// Fetch and Display Functions
async function loadTweets() {
  const options: TweetSearchOptions = {
    query:    queryInput.value.trim() || undefined,
    author:   authorInput.value.trim() || undefined,
    sortBy:   (sortSelect.value as SortOption) || undefined,
    hasMedia: mediaCheck.checked || undefined,
    dateFrom: dateFrom.value ? new Date(dateFrom.value).getTime() : undefined,
    dateTo:   dateTo.value   ? new Date(dateTo.value).getTime() + 86_399_999 : undefined,
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_TWEETS", options } satisfies Message)
    renderTweets(response?.tweets ?? [])
  } catch {
    renderTweets([])
  }
}

function scheduleRefresh(delay = 250) {
  clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(loadTweets, delay)
}

// Scan Button 
scanBtn.addEventListener("click", async () => {
  if (isScanning) {
    try {
      await chrome.runtime.sendMessage({ type: "STOP_SCAN" } satisfies Message)
    } catch {}
    // wait for SCAN_COMPLETE to arrive.
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url ?? ""
  if (!url.match(/https:\/\/(twitter|x)\.com\/.+\/likes/)) {
    statusEl.textContent = "Navigate to a Twitter/X likes page first"
    return
  }

  progressEl.textContent = ""
  setScanState(true)
  try {
    const res = await chrome.runtime.sendMessage({ type: "START_SCAN" } satisfies Message)
    if (res && res.ok === false) {
      statusEl.textContent = res.error || "Failed to start scan"
      setScanState(false)
    }
  } catch (err) {
    console.error("[TwitterSort] START_SCAN failed:", err)
    statusEl.textContent = "Failed to start scan"
    setScanState(false)
  }
})

clearBtn.addEventListener("click", async () => {
  if (isScanning) {
    statusEl.textContent = "Stop the scan before clearing"
    return
  }
  if (!confirm("Delete all stored tweets? This cannot be undone.")) return
  clearBtn.disabled = true
  try {
    const res = await chrome.runtime.sendMessage({ type: "CLEAR_DB" } satisfies Message)
    if (!res?.ok) {
      statusEl.textContent = "Failed to clear"
    } else {
      progressEl.textContent = ""
      statusEl.textContent = "Cleared"
    }
  } catch {
    statusEl.textContent = "Failed to clear"
  } finally {
    clearBtn.disabled = false
    loadTweets()
  }
})

// Listener for progress or completion
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === "SCAN_PROGRESS") {
    progressEl.textContent = `${message.scanned} collected…`
    scheduleRefresh()
  } else if (message.type === "SCAN_COMPLETE") {
    const label = message.reason === "stopped" ? "Stopped"
               : message.reason === "error"   ? "Error"
               : "Done"
    progressEl.textContent = `${label} — ${message.scanned} collected`
    setScanState(false)
    loadTweets()
  } else if (message.type === "TWEETS_UPDATED") {
    // Fired by background after each save, refresh the visible list.
    countEl.textContent = `${message.count} tweet${message.count !== 1 ? "s" : ""}`
    scheduleRefresh()
  }
})

// Filter and Sort Controls
let debounceTimer = 0
function debouncedLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(loadTweets, 300)
}

queryInput.addEventListener("input", debouncedLoad)
authorInput.addEventListener("input", debouncedLoad)
sortSelect.addEventListener("change", loadTweets)
mediaCheck.addEventListener("change", loadTweets)
dateFrom.addEventListener("change", loadTweets)
dateTo.addEventListener("change", loadTweets)

// Init
loadTweets()
