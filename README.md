# AgentRam

AgentRam is a local monitoring dashboard for reviewing agents, tracking trust and risk, and checking BNB/ERC-8004 agent registry data.

## Features
- Agent registry dashboard with status, risk, trust score, and notes
- Login flow with local token-based auth
- Search and filters based on natural-language queries
- BNB Agent lookup panel for Agent ID, wallet, and name queries
- Freemint candidate detection based on registry metadata and decoded agent URI payloads

## Default login
- Username: `admin`
- Password: `admin123`

## Run locally
1. Start the API server:
   ```bash
   npm install
   node server.js
   ```
2. Serve the dashboard in a static web server (for example):
   ```bash
   python -m http.server 8080
   ```
3. Open the app in a browser:
   ```text
   http://localhost:8080
   ```

## API endpoints
- `POST /api/login`
- `GET /api/me`
- `GET /api/agents`
- `POST /api/agents`
- `PUT /api/agents`
- `DELETE /api/agents?id=<agentId>`
- `GET /api/bnb/lookup?agentId=...&wallet=...&name=...&network=bsc-mainnet`
- `GET /api/bnb/health`

## Notes
The app expects the API at `http://localhost:3000/api`, so the Node.js server must remain running while using the dashboard.
