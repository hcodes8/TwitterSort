export interface Tweet {
    id: string
    text: string
    author: TweetAuthor
    timestamp: number
    url: string
    likes: number
    retweets: number
    replies: number
    views: number
    media?: TweetMedia[]
}

export interface TweetAuthor {
    username: string
    displayName: string
    verified: boolean
}

export interface TweetMedia {
    type: "image" | "video" | "gif"
    url: string
}

export interface TweetSearchOptions {
  query?: string
  author?: string
  hasMedia?: boolean
  dateFrom?: number
  dateTo?: number
  sortBy?: SortOption
}

export type SortOption =
  | "newest"
  | "oldest"
  | "author"
  | "likes"