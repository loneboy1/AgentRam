# AgentRam

AgentRam is a lightweight BNB Chain / ERC-8004 agent monitoring dashboard and freemint discovery radar. It combines a dashboard for tracking agent records with a searchable directory of public discovery sources and a live radar of current BSC freemint NFT projects.

> **Status:** Community monitoring and research project. Source listings are discovery leads, not endorsements, investment advice, or proof that a campaign is current, safe, or free.

> **Note:** The dashboard has no login. Anyone with the link can view the site. The watchlist itself is stored per person in the browser's local storage, so each visitor keeps their own list — but do not use it for private or sensitive data.

## Live demo

- https://agent-ram.vercel.app — deployed on Vercel. `server.js` serves both the API (`/api`) and the static frontend.

## Pages

- [`index.html`](index.html) — dashboard: agent watchlist (starts empty, per-person), status/risk/trust summaries, search, sidebar menus, BNB Agent Lookup panel, Freemint terbaru, and on-chain detail dialogs.
- [`watchlist.html`](watchlist.html) — "Jelajahi Agent": searchable directory of 32 discovery sources for Agent ID mints and BSC freemints, with category chips and live stats.
- [`freemint.html`](freemint.html) — "Radar Freemint": live scan of current BSC freemint NFT projects, sorted by project birth, with a BARU badge for projects born less than 6 hours ago.
- [`about.html`](about.html) — project scope, workflow, and safety notes.

## Features

- **Watchlist from zero, live only:** agents enter the list only through the BNB Agent Lookup (+ Pantau) — no manual typing, no seed data. Entries are validated and stored in `localStorage` (`agentram-watchlist-v1`).
- **BNB Agent Lookup:** one "Cari agent" field auto-detects an agent ID (digits), a wallet (`0x...`), or a name, and queries the 8004scan indexer on BSC mainnet (chain 56) or testnet (chain 97). Results show a Freemint badge when an agent looks like a freemint/launchpad campaign.
- **Freemint terbaru (agent IDs):** scans the newest ~1,000 agents on the indexer for freemint keyword candidates (usually 10–20 hits, ~1–2% match). A keyword hit is a lead, not a verified free mint.
- **Detail on-chain:** per-agent dialog with live data from the indexer (owner, ENS/username, image, description, verified badge, stars, scores, rank, protocols, x402, registration date) plus BscScan/8004scan links.
- **Import / Export JSON:** back up the watchlist to a file and restore it later. Import validates every entry, skips duplicates, and reports imported / duplicate / invalid counts.
- **Bulk delete** with an in-page confirm dialog; single-column search; status, risk, and trust summaries.
- **Radar Freemint (NFT):** `GET /api/freemint/radar` merges three no-key sources — koncet live mint feed (`ai.koncet.xyz`, price 0 BNB only), the Agent ID Hub project catalog (cached 1 hour), and the datt.my MintRadar table (with safety badges) — dedupes by contract address, sorts by project birth, and returns up to 75 results. The radar is discovery-only: it does not filter or vet projects.
- **Jelajahi Agent:** 32 curated sources (Agent ID Hub, datt.my MintRadar, mint calendars, explorers, community feeds, search links, research repos). Dead or discontinued links are removed, not listed.

## Run locally

Requirements: Node.js with built-in `fetch` support (Node 18 or newer recommended).

```bash
npm start
```

Then open http://localhost:3000 — `server.js` serves both the API and the static frontend, so no separate static server is needed. The frontend calls the API at the relative path `/api`.

Agent records live only in each visitor's browser (local storage). The server keeps no agent data, so nothing persists server-side — use a real database for anything permanent.

## GitHub Pages

GitHub Pages can serve the static HTML pages, but it does not run the Node API. Therefore the dashboard's API-dependent features (BNB lookup, Freemint terbaru, Radar Freemint) require a separately hosted backend and a configured frontend API URL. The static Jelajahi Agent page and About page work without the API. To enable Pages, configure the repository under **Settings → Pages** and choose a supported publishing source/workflow.

## Reviewing a source or campaign

1. Treat a calendar, social post, catalog, or repository as a lead—not as authoritative proof.
2. Follow the project link to its official channel and confirm the campaign is still active.
3. Independently inspect the contract, network, mint/claim price, eligibility, supply, and transaction behavior using a trusted explorer.
4. Remember that a “free” mint may still require network gas, and pages can be stale or malicious.
5. Never share seed phrases, private keys, passwords, or wallet credentials with a website or agent.

AgentRam does not automatically monitor every external site, validate campaign claims, or execute mint transactions.

## Repository map

```
├── about.html       # Project overview and safety notes
├── dashboard.js     # Dashboard frontend behavior
├── freemint.html    # Radar Freemint page
├── index.html       # Dashboard page
├── package.json     # Node metadata (dotenv only)
├── README.md        # This file
├── server.js        # Node API + static file server
├── styles.css       # Dashboard styles
└── watchlist.html   # Jelajahi Agent source directory
```

## Disclaimer

This project is for monitoring and research. External sources and project links are community-supplied or publicly discovered and may be inaccurate, unsafe, or outdated. Verify independently. Nothing in this repository is financial advice or a guarantee of safety or returns.
