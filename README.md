# AgentRam

AgentRam is a lightweight BNB Chain / Agent ID monitoring dashboard and source directory. It combines a local dashboard for tracking agent records with a searchable watchlist of public discovery sources for Agent ID-related mint campaigns.

> **Status:** Community monitoring and research project. Source listings are discovery leads, not endorsements, investment advice, or proof that a campaign is current, safe, or free.

## Pages

- [`index.html`](index.html) — dashboard UI for agent records, status/risk/trust summaries, search, and the BNB Agent lookup panel.
- [`watchlist.html`](watchlist.html) — searchable source directory with category and manual-check filters. Manual check state is stored in the browser's local storage.
- [`about.html`](about.html) — project scope, workflow, and safety notes.

The watchlist includes Agent ID catalogs, mint calendars, community feeds, search links, blockchain explorers, research tools, and example campaign/project repositories. Unknown or unstable links (such as the specific trycloudflare Agent Radar URL and canonical Boltbook URL) are identified as search placeholders rather than official links.

## Features

- Agent registry dashboard with add, edit, delete, search, and JSON export.
- Status, risk, and trust summaries for tracked agent records.
- BNB ERC-8004 lookup panel, backed by the local API and 8004scan indexer.
- Searchable source directory with category filters and locally saved manual review status.
- Direct links to discovery and verification resources, including Agent ID Hub, BscScan, BNB Chain explorers, calendars, and social/search feeds.

## Run locally

Requirements: Node.js with built-in `fetch` support (Node 18 or newer recommended).

```bash
npm start
```

The API listens at `/api`. Open `index.html` from a local static server or configure the frontend API URL for your environment. The frontend currently uses `/api` in `app.js`; a deployed frontend will not be able to use a visitor's localhost as its backend.

The API creates local JSON data files under `data/` as needed. The API uses environment variables (ADMIN_USERNAME and ADMIN_PASSWORD) for secure authentication.


## GitHub Pages

GitHub Pages can serve the static HTML pages, but it does not run the Node API. Therefore the dashboard's API-dependent features (login, saved agent records, BNB lookup) require a separately hosted backend and a configured frontend API URL. The static watchlist and About page work without the API. To enable Pages, configure the repository under **Settings → Pages** and choose a supported publishing source/workflow.

## Reviewing a source or campaign

1. Treat a calendar, social post, catalog, or repository as a lead—not as authoritative proof.
2. Follow the project link to its official channel and confirm the campaign is still active.
3. Independently inspect the contract, network, mint/claim price, eligibility, supply, and transaction behavior using a trusted explorer.
4. Remember that a “free” mint may still require network gas, and pages can be stale or malicious.
5. Never share seed phrases, private keys, passwords, or wallet credentials with a website or agent.

AgentRam does not automatically monitor every external site, validate campaign claims, or execute mint transactions.

## Repository map

```text
.
├── about.html       # Project overview and safety notes
├── app.js           # Dashboard frontend behavior
├── index.html       # Dashboard page
├── server.js        # Local Node API
├── styles.css       # Dashboard styles
├── watchlist.html   # Searchable source directory
└── data/            # Local API data (created/used at runtime)
```

## Disclaimer

This project is for monitoring and research. External sources and project links are community-supplied or publicly discovered and may be inaccurate, unsafe, or outdated. Verify independently. Nothing in this repository is financial advice or a guarantee of safety or returns.
