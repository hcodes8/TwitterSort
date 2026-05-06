import { DB_NAME, DB_VERSION, STORE_TWEETS } from "../shared/constants"
import { Tweet, TweetSearchOptions } from "../shared/types"
import { Message } from "../shared/messaging"

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_TWEETS)) {
        const store = database.createObjectStore(STORE_TWEETS, { keyPath: "id" })
        store.createIndex("timestamp", "timestamp")
        store.createIndex("likes", "likes")
        store.createIndex("author", "author.username")
      }
    }
    req.onsuccess = (e) => {
      const database = (e.target as IDBOpenDBRequest).result
      database.onclose = () => { dbPromise = null }
      database.onversionchange = () => {
        database.close()
        dbPromise = null
      }
      resolve(database)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function isValidTweet(t: unknown): t is Tweet {
  if (!t || typeof t !== "object") return false
  const obj = t as Record<string, unknown>
  return typeof obj.id === "string" && obj.id.length > 0
    && typeof obj.timestamp === "number" && !isNaN(obj.timestamp as number)
    && typeof obj.author === "object" && obj.author !== null
}

async function saveTweets(tweets: Tweet[]): Promise<number> {
  const valid = Array.isArray(tweets) ? tweets.filter(isValidTweet) : []
  if (valid.length === 0) return 0

  const database = await openDB()
  return new Promise<number>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = database.transaction(STORE_TWEETS, "readwrite")
    } catch (err) {
      reject(err)
      return
    }
    const store = tx.objectStore(STORE_TWEETS)
    let written = 0
    for (const tweet of valid) {
      const req = store.put(tweet)
      req.onsuccess = () => { written++ }
      req.onerror = (e) => {
        console.warn("[TwitterSort] put failed for", tweet.id, e)
      }
    }
    tx.oncomplete = () => resolve(written)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"))
  })
}

async function getTweets(options: TweetSearchOptions = {}): Promise<Tweet[]> {
  const database = await openDB()
  return new Promise<Tweet[]>((resolve, reject) => {
    const tx = database.transaction(STORE_TWEETS, "readonly")
    const req = tx.objectStore(STORE_TWEETS).getAll()
    req.onsuccess = () => {
      let tweets: Tweet[] = req.result ?? []

      if (options.query) {
        const q = options.query.toLowerCase()
        tweets = tweets.filter(
          t => t.text.toLowerCase().includes(q) ||
               t.author.displayName.toLowerCase().includes(q) ||
               t.author.username.toLowerCase().includes(q)
        )
      }
      if (options.author) {
        const a = options.author.toLowerCase().replace(/^@/, "")
        tweets = tweets.filter(t => t.author.username.toLowerCase().includes(a))
      }
      if (options.hasMedia) {
        tweets = tweets.filter(t => t.media != null && t.media.length > 0)
      }
      if (options.dateFrom != null) {
        tweets = tweets.filter(t => t.timestamp >= options.dateFrom!)
      }
      if (options.dateTo != null) {
        tweets = tweets.filter(t => t.timestamp <= options.dateTo!)
      }

      switch (options.sortBy) {
        case "oldest": tweets.sort((a, b) => a.timestamp - b.timestamp); break
        case "likes":  tweets.sort((a, b) => b.likes - a.likes); break
        case "author": tweets.sort((a, b) => a.author.username.localeCompare(b.author.username)); break
        default:       tweets.sort((a, b) => b.timestamp - a.timestamp)
      }

      resolve(tweets)
    }
    req.onerror = () => reject(req.error)
  })
}

async function getTotalCount(): Promise<number> {
  const database = await openDB()
  return new Promise<number>((resolve, reject) => {
    const tx = database.transaction(STORE_TWEETS, "readonly")
    const req = tx.objectStore(STORE_TWEETS).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function deleteTweet(id: string): Promise<boolean> {
  if (!id) return false
  const database = await openDB()
  return new Promise<boolean>((resolve, reject) => {
    const tx = database.transaction(STORE_TWEETS, "readwrite")
    tx.objectStore(STORE_TWEETS).delete(id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"))
  })
}

async function clearDb(): Promise<void> {
  const database = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE_TWEETS, "readwrite")
    tx.objectStore(STORE_TWEETS).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"))
  })
}

async function findLikesTab(): Promise<chrome.tabs.Tab | null> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (active?.url && /https:\/\/(twitter|x)\.com\/.+\/likes/.test(active.url)) {
    return active
  }
  // Fall back to any tab on a likes page
  const tabs = await chrome.tabs.query({ url: ["https://twitter.com/*/likes*", "https://x.com/*/likes*"] })
  return tabs[0] ?? null
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })
    return true
  } catch (err) {
    console.warn("[TwitterSort] executeScript:", err)
    return false
  }
}

async function forwardToContentScript(message: Message): Promise<{ ok: boolean; error?: string }> {
  const tab = await findLikesTab()
  if (!tab?.id) {
    return { ok: false, error: "Open a Twitter/X likes page first" }
  }
  await ensureContentScript(tab.id)
  try {
    await chrome.tabs.sendMessage(tab.id, message)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === "SAVE_TWEETS") {
    saveTweets(message.tweets)
      .then(async saved => {
        const total = await getTotalCount()
        chrome.runtime.sendMessage({ type: "TWEETS_UPDATED", count: total } satisfies Message)
          .catch(() => {})
        sendResponse({ type: "SAVE_TWEETS_RESPONSE", ok: true, saved, total } satisfies Message)
      })
      .catch(err => {
        console.error("[TwitterSort] saveTweets failed:", err)
        sendResponse({ type: "SAVE_TWEETS_RESPONSE", ok: false, saved: 0, total: 0 } satisfies Message)
      })
    return true
  }

  if (message.type === "GET_TWEETS") {
    getTweets(message.options)
      .then(tweets => sendResponse({ tweets }))
      .catch(err => {
        console.error("[TwitterSort] getTweets failed:", err)
        sendResponse({ tweets: [] })
      })
    return true
  }

  if (message.type === "DELETE_TWEET") {
    deleteTweet(message.id)
      .then(async () => {
        const total = await getTotalCount()
        chrome.runtime.sendMessage({ type: "TWEETS_UPDATED", count: total } satisfies Message)
          .catch(() => {})
        sendResponse({ ok: true, total })
      })
      .catch(err => {
        console.error("[TwitterSort] deleteTweet failed:", err)
        sendResponse({ ok: false, error: String(err) })
      })
    return true
  }

  if (message.type === "CLEAR_DB") {
    clearDb()
      .then(() => {
        chrome.runtime.sendMessage({ type: "TWEETS_UPDATED", count: 0 } satisfies Message)
          .catch(() => {})
        sendResponse({ ok: true })
      })
      .catch(err => {
        console.error("[TwitterSort] clearDb failed:", err)
        sendResponse({ ok: false, error: String(err) })
      })
    return true
  }

  if (message.type === "START_SCAN" || message.type === "STOP_SCAN") {
    forwardToContentScript(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: String(err) }))
    return true
  }

  return false
})
