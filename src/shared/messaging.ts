import { Tweet, TweetSearchOptions } from "./types"

export type Message =
  | StartScanMessage
  | StopScanMessage
  | GetTweetsMessage
  | GetTweetsResponseMessage
  | SaveTweetsMessage
  | SaveTweetsResponseMessage
  | TweetsUpdatedMessage
  | ScanProgressMessage
  | ScanCompleteMessage
  | ClearDbMessage
  | DeleteTweetMessage

export interface StartScanMessage {
  type: "START_SCAN"
}

export interface StopScanMessage {
  type: "STOP_SCAN"
}

export interface GetTweetsMessage {
  type: "GET_TWEETS"
  options?: TweetSearchOptions
}

export interface GetTweetsResponseMessage {
  type: "GET_TWEETS_RESPONSE"
  tweets: Tweet[]
}

export interface SaveTweetsMessage {
  type: "SAVE_TWEETS"
  tweets: Tweet[]
}

export interface SaveTweetsResponseMessage {
  type: "SAVE_TWEETS_RESPONSE"
  ok: boolean
  saved: number
  total: number
}

export interface TweetsUpdatedMessage {
  type: "TWEETS_UPDATED"
  count: number
}

export interface ScanProgressMessage {
  type: "SCAN_PROGRESS"
  scanned: number
}

export interface ScanCompleteMessage {
  type: "SCAN_COMPLETE"
  scanned: number
  reason: "stopped" | "exhausted" | "error"
}

export interface ClearDbMessage {
  type: "CLEAR_DB"
}

export interface DeleteTweetMessage {
  type: "DELETE_TWEET"
  id: string
}

type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void

export function sendMessage(message: Message): Promise<any> {
  return chrome.runtime.sendMessage(message)
}

export function sendTabMessage(tabId: number, message: Message): Promise<any> {
  return chrome.tabs.sendMessage(tabId, message)
}

export function listenMessages(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener(handler)
}
