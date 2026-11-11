const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
require('dotenv').config();

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join('/tmp', 'agents.json');
const USERS_FILE = path.join('/tmp', 'users.json');
const DEFAULT_USERNAME = process.env.APP_USERNAME || 'admin';
const DEFAULT_PASSWORD = process.env.APP_PASSWORD || 'ChangeMeStrong!2026';

const sessions = new Map();

const BNB_NETWORKS = {
  'bsc-mainnet': {
    name: 'bsc-mainnet',
    chainId: 56,
    registryContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    scanApi: 'https://www.8004scan.io/api/v1'
  },
  'bsc-testnet': {
    name: 'bsc-testnet',
    chainId: 97,
    registryContract: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    scanApi: 'https://www.8004scan.io/api/v1'
  }
};

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

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
    }
  ]);

  ensureJsonFile(USERS_FILE, [
    {
      username: DEFAULT_USERNAME,
      password: hashValue(DEFAULT_PASSWORD),
      role: 'admin'
    }
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

function sanitizeAgentPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid agent payload');
  }

  const id = String(payload.id || '').trim();
  const name = String(payload.name || '').trim();
  const wallet = String(payload.wallet || '').trim();
  const status = ['Active', 'Pending', 'Alert'].includes(payload.status) ? payload.status : 'Pending';
  const risk = ['Low', 'Medium', 'High'].includes(payload.risk) ? payload.risk : 'Low';
  const trustValue = Number(payload.trust);

  if (!id || !name) {
    throw new Error('Agent ID and name are required');
  }

  if (!Number.isInteger(trustValue) || trustValue < 0 || trustValue > 100) {
    throw new Error('Trust must be an integer between 0 and 100');
  }

  return {
    id,
    name,
    wallet,
    status,
    risk,
    trust: trustValue,
    lastSync: String(payload.lastSync || 'Baru saja').trim() || 'Baru saja',
    notes: String(payload.notes || '').trim()
  };
}

function getUserFromDb(username, password) {
  const users = readJson(USERS_FILE);
  const user = users.find((entry) => entry.username === username);

  if (!user) return null;

  if (user.password === hashValue(password)) return user;
  if (user.password === password) return user; // legacy compatibility

  return null;
}

function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 8
  });
  return token;
}

function getSessionFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = sessions.get(token);

  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
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

function decodeAgentUri(agentUri) {
  if (!agentUri || typeof agentUri !== 'string') return null;

  try {
    if (agentUri.startsWith('data:application/json;base64,')) {
      const base64 = agentUri.replace(/^data:application\/json;base64,/i, '');
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(decoded);
    }
    if (agentUri.startsWith('http://') || agentUri.startsWith('https://')) {
      return null;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function normalizeAgentLookup(item) {
  const tokenId = item?.token_id ?? item?.agentId ?? item?.id ?? null;
  const ownerAddress = item?.owner_address ?? item?.ownerAddress ?? '';
  const agentUri = item?.agent_uri ?? item?.agentUri ?? '';
  const name = item?.name ?? '';
  const description = item?.description ?? '';
  const decodedAgentUri = decodeAgentUri(agentUri);
  const textBlob = [
    name,
    description,
    ownerAddress,
    agentUri,
    decodedAgentUri ? JSON.stringify(decodedAgentUri) : '',
    Array.isArray(item?.services) ? item.services.map((svc) => JSON.stringify(svc)).join(' ') : ''
  ].join(' ').toLowerCase();

  const freemintCandidate = /(freemint|free[-\s]?mint|minting|launchpad|campaign)/i.test(textBlob);

  return {
    agentId: tokenId !== null && tokenId !== undefined ? Number(tokenId) : null,
    name,
    ownerAddress,
    network: item?.network || 'bsc-mainnet',
    registryContract: item?.registryContract || item?.registry_contract || '',
    agentUri,
    decodedAgentUri,
    freemintCandidate,
    description,
    source: '8004scan indexer',
    raw: item
  };
}

async function fetchBnbAgents(networkName = 'bsc-mainnet') {
  const network = BNB_NETWORKS[networkName] || BNB_NETWORKS['bsc-mainnet'];
  const url = new URL(`${network.scanApi}/agents`);
  url.searchParams.set('chain_id', String(network.chainId));
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', '0');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`8004scan API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return {
    network: network.name,
    registryContract: network.registryContract,
    total: Number(data?.total ?? items.length ?? 0),
    items: items.map(normalizeAgentLookup)
  };
}

async function lookupBnbAgent({ agentId, wallet, name, network = 'bsc-mainnet' }) {
  const networkName = BNB_NETWORKS[network] ? network : 'bsc-mainnet';
  const { items, total, registryContract } = await fetchBnbAgents(networkName);

  let filtered = items;

  if (agentId !== undefined && agentId !== null && agentId !== '') {
    filtered = filtered.filter((item) => String(item.agentId) === String(agentId));
  }

  if (wallet) {
    filtered = filtered.filter((item) => String(item.ownerAddress || '').toLowerCase() === wallet.toLowerCase());
  }

  if (name) {
    filtered = filtered.filter((item) => String(item.name || '').toLowerCase().includes(name.toLowerCase()));
  }

  return {
    network: networkName,
    registryContract,
    total,
    matched: filtered.length,
    results: filtered.slice(0, 25),
    source: '8004scan indexer'
  };
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

  if (parsedUrl.pathname === '/api/login') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    try {
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!username || !password) {
        sendJson(res, 400, { message: 'Username dan password wajib diisi.' });
        return;
      }

      const user = getUserFromDb(username, password);

      if (!user) {
        sendJson(res, 401, { message: 'Username atau password salah.' });
        return;
      }

      const token = createSession(user.username);

      sendJson(res, 200, {
        token,
        user: {
          username: user.username,
          role: user.role
        }
      });
      return;
    } catch (error) {
      sendJson(res, 400, { message: error.message || 'Invalid payload' });
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
      sendJson(res, 200, readAgents());
      return;
    }

    if (req.method === 'POST') {
      try {
        const payload = sanitizeAgentPayload(await parseBody(req));
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
        const payload = sanitizeAgentPayload(await parseBody(req));
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
      const id = String(parsedUrl.searchParams.get('id') || '').trim();
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

  if (parsedUrl.pathname === '/api/bnb/lookup') {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      try {
        const agentId = parsedUrl.searchParams.get('agentId');
        const wallet = parsedUrl.searchParams.get('wallet');
        const name = parsedUrl.searchParams.get('name');
        const network = parsedUrl.searchParams.get('network') || 'bsc-mainnet';

        const result = await lookupBnbAgent({
          agentId: agentId === null ? undefined : agentId,
          wallet: wallet || undefined,
          name: name || undefined,
          network
        });

        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { message: error.message || 'BNB lookup failed' });
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await lookupBnbAgent({
          agentId: body.agentId,
          wallet: body.wallet,
          name: body.name,
          network: body.network || 'bsc-mainnet'
        });

        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { message: error.message || 'BNB lookup failed' });
      }
      return;
    }

    sendJson(res, 405, { message: 'Method not allowed' });
    return;
  }

  if (parsedUrl.pathname === '/api/bnb/health') {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      network: 'bsc-mainnet',
      registryContract: BNB_NETWORKS['bsc-mainnet'].registryContract,
      source: '8004scan indexer',
      note: 'Official ERC-8004 registry lookup endpoint for BNB agent records.'
    });
    return;
  }

  sendJson(res, 404, { message: 'Not found' });
});

if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`AgentRam API running at http://localhost:${PORT}`);
    console.log(`Login username: ${DEFAULT_USERNAME}`);
    console.log(`Password: ${DEFAULT_PASSWORD}`);
    console.log('BNB Agent lookup: /api/bnb/lookup?agentId=123&network=bsc-mainnet');
  });
}

module.exports = server;
