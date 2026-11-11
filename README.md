# AgentRam

AgentRam is a lightweight BNB Chain / Agent ID monitoring dashboard and source directory. It combines a dashboard for tracking agent records with a searchable watchlist of public discovery sources for Agent ID-related mint campaigns.

> **Status:** Community monitoring and research project. Source listings are discovery leads, not endorsements, investment advice, or proof that a campaign is current, safe, or free.

> **Note:** The dashboard has no login. Anyone with the link can view and edit the tracked agent records, so do not use it for private or sensitive data.

## Live demo

- https://agent-ram.vercel.app — deployed on Vercel. `server.js` serves both the API (`/api`) and the static frontend.

## Pages

- [`index.html`](index.html) — dashboard UI for agent records, status/risk/trust summaries, search, sidebar menus, and the BNB Agent Lookup panel.
- [`watchlist.html`](watchlist.html) — searchable source directory with category and manual-check filters. Manual check state is stored in the browser's local storage.
- [`about.html`](about.html) — project scope, workflow, and safety notes.

The watchlist includes Agent ID catalogs, mint calendars, community feeds, search links, blockchain explorers, research tools, and example campaign/project repositories. Unknown or unstable links (such as the specific trycloudflare Agent Radar URL and canonical Boltbook URL) are identified as search placeholders rather than official links.

## Features

- Agent registry dashboard with add, edit, delete, search, and JSON export.
- Status, risk, and trust summaries for tracked agent records.
- Sidebar menus: Overview (reset view), Agents (jump to the table), Alerts (show Alert agents only), Reports (export JSON), Audit (sync log per agent).
- BNB Agent Lookup panel: search the 8004scan indexer by agent ID, wallet, or name on BSC mainnet (chain 56) or testnet (chain 97). Results show a Freemint badge when an agent looks like a freemint/launchpad campaign, and a "+ Pantau" button adds a found agent to the watchlist.
- Searchable source directory with category filters and locally saved manual review status.
- Direct links to discovery and verification resources, including Agent ID Hub, BscScan, BNB Chain explorers, calendars, and social/search feeds.

## Run locally

Requirements: Node.js with built-in `fetch` support (Node 18 or newer recommended).

```bash
npm start
```

Then open http://localhost:3000 — `server.js` serves both the API and the static frontend, so no separate static server is needed. The frontend calls the API at the relative path `/api`.

Agent records are stored in a JSON file on the server (`/tmp/agents.json`, seeded with 3 example agents). On serverless hosting the data does not persist across restarts — use a real database for anything permanent.

## GitHub Pages

GitHub Pages can serve the static HTML pages, but it does not run the Node API. Therefore the dashboard's API-dependent features (saved agent records, BNB lookup) require a separately hosted backend and a configured frontend API URL. The static watchlist and About page work without the API. To enable Pages, configure the repository under **Settings → Pages** and choose a supported publishing source/workflow.

## Reviewing a source or campaign

1. Treat a calendar, social post, catalog, or repository as a lead—not as authoritative proof.
2. Follow the project link to its official channel and confirm the campaign is still active.
3. Independently inspect the contract, network, mint/claim price, eligibility, supply, and transaction behavior using a trusted explorer.
4. Remember that a “free” mint may still require network gas, and pages can be stale or malicious.
5. Never share seed phrases, private keys, passwords, or wallet credentials with a website or agent.

AgentRam does not automatically monitor every external site, validate campaign claims, or execute mint transactions.

## Repository map

├── about.html       # Project overview and safety notes
├── agents.json      # Example agent data (served statically)
├── dashboard.js     # Dashboard frontend behavior
├── data/            # Local data folder (API records currently live in /tmp/agents.json)
├── index.html       # Dashboard page
├── server.js        # Node API + static file server
├── styles.css       # Dashboard styles
└── watchlist.html   # Searchable source directory
```

## Disclaimer

This project is for monitoring and research. External sources and project links are community-supplied or publicly discovered and may be inaccurate, unsafe, or outdated. Verify independently. Nothing in this repository is financial advice or a guarantee of safety or returns.
