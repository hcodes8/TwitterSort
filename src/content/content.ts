import { SCROLL_DELAY, SCAN_BATCH_SIZE } from "../shared/constants"
import { Tweet, TweetAuthor, TweetMedia } from "../shared/types"
import { Message } from "../shared/messaging"
import { qsa } from "../utils/dom"

const LOADED_FLAG = "__twitterLikesContentLoaded__"
if ((globalThis as any)[LOADED_FLAG]) {
  // Already loaded, previous listeners remain active.
} else {
  (globalThis as any)[LOADED_FLAG] = true
  main()
}

function main() {
  let scanning = false
  const seenIds = new Set<string>()

  function parseNum(raw: string): number {
    if (!raw) return 0
    const clean = raw.replace(/,/g, "").trim()
    if (/[Kk]$/.test(clean)) return Math.round(parseFloat(clean) * 1_000)
    if (/[Mm]$/.test(clean)) return Math.round(parseFloat(clean) * 1_000_000)
    if (/[Bb]$/.test(clean)) return Math.round(parseFloat(clean) * 1_000_000_000)
    const n = parseInt(clean, 10)
    return isNaN(n) ? 0 : n
  }

  function parseEngagement(article: Element) {
    const groups = article.querySelectorAll('[role="group"][aria-label]')
    let label = ""
    groups.forEach(g => {
      const l = g.getAttribute("aria-label") ?? ""
      if (l.length > label.length) label = l
    })

    const pick = (regex: RegExp): number => {
      const m = label.match(regex)
      return m ? parseNum(m[1]) : 0
    }
    return {
      replies:  pick(/([\d.,]+\s*[KMBkmb]?)\s+repl/i),
      retweets: pick(/([\d.,]+\s*[KMBkmb]?)\s+(?:repost|retweet)/i),
      likes:    pick(/([\d.,]+\s*[KMBkmb]?)\s+like/i),
      views:    pick(/([\d.,]+\s*[KMBkmb]?)\s+view/i),
    }
  }

  function extractAuthor(article: Element, usernameFromHref: string): TweetAuthor {
    const userNameEl = article.querySelector('[data-testid="User-Name"]')
    const spans = userNameEl ? qsa<HTMLSpanElement>("span", userNameEl) : []
    const texts = spans
      .map(s => s.textContent?.trim() ?? "")
      .filter(t => t.length > 0)

    const displayName = texts.find(t => !t.startsWith("@") && t !== "·") ?? usernameFromHref
    const atHandle = texts.find(t => t.startsWith("@"))
    const username = atHandle ? atHandle.slice(1) : usernameFromHref
    const verified = !!article.querySelector('[data-testid="icon-verified"]')

    return { username, displayName, verified }
  }

  function parseTweet(article: Element): Tweet | null {
    const timeEl = article.querySelector("time")
    if (!timeEl) return null

    const link = timeEl.closest("a")
    const href = link?.getAttribute("href") ?? ""
    const idMatch = href.match(/\/status\/(\d+)/)
    if (!idMatch) return null

    const id = idMatch[1]
    const url = `https://x.com${href}`
    const timestamp = new Date(timeEl.getAttribute("datetime") ?? "").getTime()
    if (isNaN(timestamp)) return null

    // First path segment of /<username>/status/<id> is the author's handle.
    const usernameFromHref = href.split("/").filter(Boolean)[0] ?? ""

    const author = extractAuthor(article, usernameFromHref)

    const textEl = article.querySelector('[data-testid="tweetText"]')
    const text = textEl?.textContent?.trim() ?? ""

    const { replies, retweets, likes, views } = parseEngagement(article)

    const media: TweetMedia[] = []
    article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
      const src = (img as HTMLImageElement).src
      if (src) media.push({ type: "image", url: src })
    })
    article.querySelectorAll("video").forEach(v => {
      const video = v as HTMLVideoElement
      const src = video.src || video.querySelector("source")?.getAttribute("src") || ""
      if (src) media.push({ type: "video", url: src })
    })

    return {
      id, text, author, timestamp, url,
      likes, retweets, replies, views,
      ...(media.length > 0 && { media }),
    }
  }

  function collectNewTweets(): Tweet[] {
    const batch: Tweet[] = []
    for (const article of qsa<Element>('article[data-testid="tweet"]')) {
      const tweet = parseTweet(article)
      if (!tweet || seenIds.has(tweet.id)) continue
      seenIds.add(tweet.id)
      batch.push(tweet)
      if (batch.length >= SCAN_BATCH_SIZE) break
    }
    return batch
  }

  async function sendSave(batch: Tweet[]): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: "SAVE_TWEETS",
        tweets: batch,
      } satisfies Message)
    } catch (err) {
      console.warn("[TwitterSort] SAVE_TWEETS failed, retrying:", err)
      try {
        await chrome.runtime.sendMessage({
          type: "SAVE_TWEETS",
          tweets: batch,
        } satisfies Message)
      } catch (err2) {
        console.error("[TwitterSort] SAVE_TWEETS retry failed — batch dropped:", err2)
      }
    }
  }

  function sendProgress(): void {
    chrome.runtime.sendMessage({
      type: "SCAN_PROGRESS",
      scanned: seenIds.size,
    } satisfies Message).catch(() => {})
  }

  function sendComplete(reason: "stopped" | "exhausted" | "error"): void {
    chrome.runtime.sendMessage({
      type: "SCAN_COMPLETE",
      scanned: seenIds.size,
      reason,
    } satisfies Message).catch(() => {})
  }

  async function scan(): Promise<void> {
    if (scanning) return
    scanning = true
    window.scrollTo(0, 0)
    let noNewStreak = 0
    let reason: "stopped" | "exhausted" | "error" = "stopped"

    try {
      while (scanning) {
        const batch = collectNewTweets()

        if (batch.length > 0) {
          noNewStreak = 0
          await sendSave(batch)
          sendProgress()
        } else {
          noNewStreak++
          if (noNewStreak >= 5) {
            reason = "exhausted"
            break
          }
        }

        const beforeHeight = document.documentElement.scrollHeight
        const beforeY = window.scrollY
        window.scrollBy({ top: window.innerHeight, behavior: "auto" })
        await new Promise(r => setTimeout(r, SCROLL_DELAY))

        // If the page didn't grow and crolling does not occur, the timeline ended, end scan
        const afterHeight = document.documentElement.scrollHeight
        const afterY = window.scrollY
        if (afterHeight === beforeHeight && afterY === beforeY && batch.length === 0) {
          noNewStreak++
        }
      }
      if (!scanning && reason === "stopped") reason = "stopped"
    } catch (err) {
      console.error("[TwitterSort] scan error:", err)
      reason = "error"
    } finally {
      scanning = false
      sendComplete(reason)
    }
  }

  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === "START_SCAN") {
      if (!scanning) void scan()
    } else if (message.type === "STOP_SCAN") {
      scanning = false
    }
  })

  //like/unlike watcher: testid="like" → user is adding a like; testid="unlike" → removing.
  function findArticle(el: Element): Element | null {
    return el.closest('article[data-testid="tweet"]')
  }

  function tweetIdFrom(article: Element): string | null {
    const href = article.querySelector("time")?.closest("a")?.getAttribute("href") ?? ""
    return href.match(/\/status\/(\d+)/)?.[1] ?? null
  }

  document.addEventListener("click", (e) => {
    const target = e.target as Element | null
    if (!target) return

    const likeBtn = target.closest('[data-testid="like"]')
    if (likeBtn) {
      const article = findArticle(likeBtn)
      if (!article) return
      const tweet = parseTweet(article)
      if (!tweet) return
      chrome.runtime.sendMessage({
        type: "SAVE_TWEETS",
        tweets: [tweet],
      } satisfies Message).catch(() => {})
      return
    }

    const unlikeBtn = target.closest('[data-testid="unlike"]')
    if (unlikeBtn) {
      const article = findArticle(unlikeBtn)
      if (!article) return
      const id = tweetIdFrom(article)
      if (!id) return
      chrome.runtime.sendMessage({
        type: "DELETE_TWEET",
        id,
      } satisfies Message).catch(() => {})
    }
  }, true) // capture phase
}
