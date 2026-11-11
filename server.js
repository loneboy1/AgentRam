const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'agents.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/';
const FREEMINT_CONTRACTS = {
  agentToken: '0xA2643B889eEb232708a644f15f70f951773dDEF9',
  agentIdRegistry: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F'
};
const sessions = new Map();

function ensureJsonFile(filePath, defaultData) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

function ensureSeedData() {
  ensureJsonFile(DATA_FILE, [
    {
      id: 'FA-1024',
      name: 'Maya Rafi',
      wallet: '0xA4D8...2201',
      status: 'Active',
      risk: 'Low',
      trust: 94,
      lastSync: '2 min ago',
      notes: 'Stable sync and healthy latency'
    },
    {
      id: 'FA-1031',
      name: 'Nadya Chen',
      wallet: '0xC11A...9E20',
      status: 'Pending',
      risk: 'Medium',
      trust: 78,
      lastSync: '14 min ago',
      notes: 'Waiting for validation check'
    },
    {
      id: 'FA-1045',
      name: 'Rian Suryadi',
      wallet: '0x71B2...EE89',
      status: 'Alert',
      risk: 'High',
      trust: 52,
      lastSync: '5 min ago',
      notes: 'Repeated failed node heartbeat'
    },
    {
      id: 'FA-1088',
      name: 'Alya Putri',
      wallet: '0x9EE4...AB42',
      status: 'Active',
      risk: 'Low',
      trust: 97,
      lastSync: '1 min ago',
      notes: 'No critical events detected'
    },
    {
      id: 'FA-1102',
      name: 'Fahri Zain',
      wallet: '0x5531...10FA',
      status: 'Alert',
      risk: 'Medium',
      trust: 64,
      lastSync: '9 min ago',
      notes: 'Manual review required'
    },
    {
      id: 'FA-1120',
      name: 'Dina Karina',
      wallet: '0xF097...87DB',
      status: 'Active',
      risk: 'Low',
      trust: 90,
      lastSync: '3 min ago',
      notes: 'Rewards distribution normal'
    },
    {
      id: 'FA-1139',
      name: 'Bima Hadi',
      wallet: '0x12AF...77B2',
      status: 'Pending',
      risk: 'Low',
      trust: 81,
      lastSync: '21 min ago',
      notes: 'Awaiting second credential scan'
    },
    {
      id: 'FA-1164',
      name: 'Sinta Lestari',
      wallet: '0xB708...9C40',
      status: 'Active',
      risk: 'Low',
      trust: 96,
      lastSync: '6 min ago',
      notes: 'Strong compliance score'
    }
  ]);

  ensureJsonFile(USERS_FILE, [
    { username: 'admin', password: 'admin123', role: 'admin' }
  ]);
}

function readJson(filePath) {
  ensureSeedData();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readAgents() {
  return readJson(DATA_FILE);
}

function writeAgents(data) {
  writeJson(DATA_FILE, data);
}

function getUserFromDb(username, password) {
  const users = readJson(USERS_FILE);
  return users.find((user) => user.username === username && user.password === password) || null;
}

function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, createdAt: Date.now() });
  return token;
}

function getSessionFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return sessions.get(token) || null;
}

function parseQuery(query = '') {
  const q = String(query || '').toLowerCase().trim();
  if (!q) {
    return { text: '', status: null, risk: null, minTrust: null, wallet: null, keywords: [] };
  }

  const normalized = q.replace(/[\-_/]+/g, ' ');
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const status = ['active', 'pending', 'alert'].find((statusName) => tokens.includes(statusName)) || null;
  const risk = ['low', 'medium', 'high'].find((riskName) => tokens.includes(riskName)) || null;

  const minTrustToken = tokens.find((token) => /^trust[><=]?\d+$/.test(token) || /^\d+%?$/.test(token));
  const minTrust = minTrustToken ? Number(String(minTrustToken).replace(/[^\d]/g, '')) : null;
  const walletToken = tokens.find((token) => token.startsWith('0x')) || null;

  return {
    text: q,
    status,
    risk,
    minTrust,
    wallet: walletToken,
    keywords: tokens.filter((token) =>
      !['active', 'pending', 'alert', 'low', 'medium', 'high', 'trust', 'wallet', 'bnb', 'agent', 'search', 'find', 'show', 'list'].includes(token)
    )
  };
}

function scoreAgent(agent, filters) {
  let score = 0;
  const haystack = [agent.id, agent.name, agent.wallet, agent.status, agent.risk, agent.notes].join(' ').toLowerCase();

  if (filters.text) {
    if (haystack.includes(filters.text)) score += 40;
    filters.keywords.forEach((keyword) => {
      if (haystack.includes(keyword)) score += 12;
    });
  }

  if (filters.status && agent.status.toLowerCase() === filters.status) score += 22;
  if (filters.risk && agent.risk.toLowerCase() === filters.risk) score += 18;
  if (filters.wallet && String(agent.wallet).toLowerCase().includes(filters.wallet)) score += 25;
  if (filters.minTrust !== null && Number(agent.trust) >= filters.minTrust) score += 15;

  if (agent.status === 'Alert') score += 8;
  if (agent.risk === 'High') score += 8;

  return score;
}

function smartSearchAgents(query = '', list = []) {
  const filters = parseQuery(query);
  const results = list
    .map((agent) => ({ agent, score: scoreAgent(agent, filters) }))
    .filter(({ score, agent }) => {
      if (!filters.text) return true;
      if (filters.status && agent.status.toLowerCase() !== filters.status) return false;
      if (filters.risk && agent.risk.toLowerCase() !== filters.risk) return false;
      if (filters.minTrust !== null && Number(agent.trust) < filters.minTrust) return false;
      if (filters.wallet && !String(agent.wallet).toLowerCase().includes(filters.wallet)) return false;
      return score > 0 || agent.id.toLowerCase().includes(filters.text) || agent.name.toLowerCase().includes(filters.text);
    })
    .sort((a, b) => b.score - a.score)
    .map(({ agent }) => agent);

  return {
    query,
    filters,
    total: results.length,
    matches: results.slice(0, 20),
    summary: results.length
      ? `Ditemukan ${results.length} agent yang paling cocok untuk query "${query || 'semua data'}".`
      : `Tidak ada agent yang cocok untuk query "${query}".`
  };
}

async function rpcRequest(method, params = []) {
  const response = await fetch(BNB_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`BNB RPC request failed: ${response.status} ${text}`);
  }

  const data = text ? JSON.parse(text) : null;
  if (!data || data.error) {
    throw new Error(data?.error?.message || 'BNB RPC returned no data');
  }

  return data.result;
}

async function getBnbHealthSummary() {
  const chainIdHex = await rpcRequest('eth_chainId');
  const blockNumberHex = await rpcRequest('eth_blockNumber');

  return {
    rpc: BNB_RPC_URL,
    chainId: Number.parseInt(chainIdHex, 16),
    blockNumber: Number.parseInt(blockNumberHex, 16),
    contracts: FREEMINT_CONTRACTS,
    status: 'connected'
  };
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if (parsedUrl.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'AgentRam API' });
    return;
  }

  if (parsedUrl.pathname === '/api/bnb/health') {
    try {
      const summary = await getBnbHealthSummary();
      sendJson(res, 200, summary);
      return;
    } catch (error) {
      sendJson(res, 502, {
        status: 'disconnected',
        rpc: BNB_RPC_URL,
        message: error.message || 'Unable to reach BNB RPC'
      });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/bnb/contracts') {
    sendJson(res, 200, {
      source: 'BNB Smart Chain public RPC / BscScan references',
      contracts: FREEMINT_CONTRACTS,
      notes: [
        'Agent token contract reference: 0xA2643B889eEb232708a644f15f70f951773dDEF9',
        'Agent ID registry reference: 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F'
      ]
    });
    return;
  }

  if (parsedUrl.pathname === '/api/bnb/search') {
    const query = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('wallet') || '';
    try {
      const summary = await getBnbHealthSummary();
      const result = smartSearchAgents(query, readAgents());
      sendJson(res, 200, {
        ...result,
        chain: summary,
        searchedContracts: FREEMINT_CONTRACTS,
        note: 'This step verifies BNB RPC connectivity and prepares AgentRam for real on-chain Freemint Agent ID queries.'
      });
      return;
    } catch (error) {
      sendJson(res, 400, {
        message: error.message || 'BNB agent search failed',
        searchedContracts: FREEMINT_CONTRACTS
      });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/search' || parsedUrl.pathname === '/api/agents/search') {
    try {
      const query = parsedUrl.searchParams.get('q') || '';
      const result = smartSearchAgents(query, readAgents());
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { message: error.message || 'Search failed' });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/login') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    try {
      const body = await parseBody(req);
      const user = getUserFromDb(body.username || '', body.password || '');
      if (!user) {
        sendJson(res, 401, { message: 'Username atau password salah.' });
        return;
      }

      const token = createSession(user.username);
      sendJson(res, 200, {
        token,
        user: { username: user.username, role: user.role }
      });
      return;
    } catch (error) {
      sendJson(res, 400, { message: error.message || 'Invalid JSON payload' });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/me') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    sendJson(res, 200, { username: session.username, role: 'admin' });
    return;
  }

  if (parsedUrl.pathname === '/api/agents') {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      const query = parsedUrl.searchParams.get('q') || '';
      const agents = readAgents();
      if (query) {
        sendJson(res, 200, smartSearchAgents(query, agents));
      } else {
        sendJson(res, 200, agents);
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const payload = await parseBody(req);
        const agents = readAgents();
        const existing = agents.find((agent) => agent.id === payload.id);
        if (existing) {
          sendJson(res, 409, { message: 'Agent ID already exists' });
          return;
        }
        agents.unshift(payload);
        writeAgents(agents);
        sendJson(res, 201, payload);
      } catch (error) {
        sendJson(res, 400, { message: error.message || 'Invalid JSON payload' });
      }
      return;
    }

    if (req.method === 'PUT') {
      try {
        const payload = await parseBody(req);
        const agents = readAgents();
        const index = agents.findIndex((agent) => agent.id === payload.id);
        if (index === -1) {
          sendJson(res, 404, { message: 'Agent not found' });
          return;
        }

        agents[index] = { ...agents[index], ...payload };
        writeAgents(agents);
        sendJson(res, 200, agents[index]);
      } catch (error) {
        sendJson(res, 400, { message: error.message || 'Invalid JSON payload' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { message: 'Missing id' });
        return;
      }

      const agents = readAgents();
      const filtered = agents.filter((agent) => agent.id !== id);
      if (filtered.length === agents.length) {
        sendJson(res, 404, { message: 'Agent not found' });
        return;
      }

      writeAgents(filtered);
      sendJson(res, 200, { message: 'Agent deleted successfully' });
      return;
    }
  }

  sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`AgentRam API running at http://localhost:${PORT}`);
  console.log('Default login: admin / admin123');
  console.log('BNB RPC endpoint: ' + BNB_RPC_URL);
  console.log('BNB contract references:');
  console.log(' - Agent token: ' + FREEMINT_CONTRACTS.agentToken);
  console.log(' - Agent ID registry: ' + FREEMINT_CONTRACTS.agentIdRegistry);
});

module.exports = server;
