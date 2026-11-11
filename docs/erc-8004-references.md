# AgentRam

AgentRam is a local monitoring dashboard for reviewing agents, tracking trust and risk, and checking BNB/ERC-8004 agent registry data.

## Features
- Agent registry dashboard with status, risk, trust score, and notes
- Login flow with local token-based auth
- Search and filters based on natural-language queries
- BNB Agent lookup panel for Agent ID, wallet, and name queries
- Freemint candidate detection based on registry metadata and decoded agent URI payloads
- Aggressive risk scoring model for watchlist / critical flags
- Registry-style heuristics inspired by broader ERC-8004 marketplace patterns

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

## Reference inspiration
This project intentionally borrows patterns from recent ERC-8004 / BNB agent marketplace projects for risk-aware discovery and filtering, without cloning their source code directly. Relevant public references include:
- Elioz404/SMEAI
- FeeeeelixWong/mandatefi
- talk2francis/Marque
- mmxrealQQ/bobai-buyburn
- iamdflame/mandate-bnb
- Leihyn/dojo
- api-evangelist/chainaware-ai

These projects strongly influenced the trust/risk heuristics, freemint detection logic, and registry comparison behavior.

