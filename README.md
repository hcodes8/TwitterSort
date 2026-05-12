# Twitter Likes Manager

A Chrome extension that lets you scan, search, filter, and sort your liked tweets on Twitter/X.

## Features

- Scan your Twitter/X likes page to collect and store tweets locally
- Filter by keyword, author, date range, or media presence
- Sort by newest, oldest, author, or likes
- Tracks likes/unlikes in real time as you browse
- All data stays in your browser

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- Google Chrome (or any Chromium-based browser)

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/TwitterSort.git
   cd TwitterSort
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   For a one-time production build:

   ```bash
   npm run build
   ```

   For a development build with source maps and auto-rebuild on file changes:

   ```bash
   npm run dev
   ```

   Both commands output compiled files into the `public/` folder.

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `public/` folder inside the project directory
5. The **Twitter Likes Manager** extension will appear in your extensions list

> After any code change, run `npm run build` again (or keep `npm run dev` running), then click the refresh icon on the extension card at `chrome://extensions` to reload it.

## Usage

1. Go to `https://x.com/<username>/likes`
2. Click the extension icon in the Chrome toolbar to open the popup
3. Click **Start Scan** — the extension will scroll through the likes page and collect tweets
4. Use the search and filter controls to narrow results:
   - **Query** — keyword search in tweet text
   - **Author** — filter by username
   - **Sort** — newest, oldest, author, or most liked
   - **Has media** — show only tweets with images or videos
   - **Date range** — limit to a specific time window
5. Click **Open tweet** on any card to view the original tweet
6. Click **Stop Scan** at any time to pause collection
7. Click **Clear** to delete all stored tweets from local storage
