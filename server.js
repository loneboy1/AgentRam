const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'agents.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const WATCHLIST_FILE = path.join(__dirname, 'data', 'watchlist.json');
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
    { username: 'admin', password: 'admin123', role: 'admin' }
  ]);

  ensureJsonFile(WATCHLIST_FILE, [
    {
      id: 'watch-01',
      name: 'Astra Labs',
      agentId: 'AG-2048',
      category: 'Launch',
      sourceType: 'website',
      sourceUrl: 'https://example.com/astra',
      status: 'Monitoring',
      risk: 'Medium',
      platform: 'BNB',
      lastSeen: '2 hours ago',
      tags: ['launch', 'agent', 'reward'],
      notes: 'New public launch and wallet-linked campaign.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'watch-02',
      name: 'Miro Nexus',
      agentId: 'AG-4401',
      category: 'Campaign',
      sourceType: 'x',
      sourceUrl: 'https://x.com/miro',
      status: 'Needs Review',
      risk: 'High',
      platform: 'BNB',
      lastSeen: '5 hours ago',
      tags: ['freemint', 'campaign'],
      notes: 'Freemint claim social signal appears active.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'watch-03',
      name: 'VoltMind AI',
      agentId: 'AG-9802',
      category: 'Reward',
      sourceType: 'docs',
      sourceUrl: 'https://docs.example.com/voltmind',
      status: 'Verified',
      risk: 'Low',
      platform: 'Ethereum',
      lastSeen: '1 day ago',
      tags: ['reward', 'claim'],
      notes: 'Official docs list reward distribution pipeline.',
      updatedAt: new Date().toISOString()
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

function normalizeWatchlistTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function normalizeWatchlistItem(item = {}) {
  return {
    id: item.id || `watch-${Date.now()}`,
    name: item.name || 'Unnamed Project',
    agentId: item.agentId || '',
    category: item.category || 'General',
    sourceType: item.sourceType || 'website',
    sourceUrl: item.sourceUrl || '',
    status: item.status || 'Monitoring',
    risk: item.risk || 'Medium',
    platform: item.platform || 'BNB',
    lastSeen: item.lastSeen || 'Recently',
    tags: normalizeWatchlistTags(item.tags),
    notes: item.notes || '',
    sourceMeta: item.sourceMeta || null,
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function readWatchlist() {
  return readJson(WATCHLIST_FILE).map(normalizeWatchlistItem);
}

function writeWatchlist(data) {
  writeJson(WATCHLIST_FILE, data.map(normalizeWatchlistItem));
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

async function fetchPublicPageSummary(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 AgentRam Monitor',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) return null;

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/is) ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/is);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/is);

    return {
      title: (ogTitle?.[1] || titleMatch?.[1] || '').replace(/\s+/g, ' ').trim(),
      description: (metaDescription?.[1] || '').replace(/\s+/g, ' ').trim(),
      url
    };
  } catch (error) {
    return null;
  }
}

function computeWatchlistScore(item) {
  const riskWeight = { Low: 10, Medium: 6, High: 3 };
  const statusWeight = { Verified: 25, Monitoring: 18, 'Needs Review': 12, Deprecated: 5 };
  const categoryWeight = { Launch: 18, Campaign: 16, Freemint: 15, Reward: 14, Claim: 12, Partner: 10, General: 8 };
  const sourceBonus = item.sourceMeta ? 10 : 0;
  const tagBonus = Math.min((item.tags || []).length * 2, 12);

  return Math.min(
    100,
    (statusWeight[item.status] || 10) +
      (riskWeight[item.risk] || 6) +
      (categoryWeight[item.category] || 8) +
      sourceBonus +
      tagBonus
  );
}

async function syncWatchlistItemById(itemId) {
  const list = readWatchlist();
  const index = list.findIndex((entry) => entry.id === itemId);
  if (index === -1) return null;

  const item = list[index];
  if (!item.sourceUrl) return item;

  const summary = await fetchPublicPageSummary(item.sourceUrl);
  const updatedItem = {
    ...item,
    sourceMeta: summary || item.sourceMeta || null,
    notes: item.notes || summary?.description || `Source updated from ${item.sourceType}`,
    lastSeen: 'Just now',
    updatedAt: new Date().toISOString(),
    score: computeWatchlistScore({ ...item, sourceMeta: summary || item.sourceMeta || null })
  };

  list[index] = updatedItem;
  writeWatchlist(list);
  return updatedItem;
}

async function syncWatchlistSources() {
  const list = readWatchlist();
  const syncResults = [];

  for (const item of list) {
    if (!item.sourceUrl) {
      syncResults.push({ id: item.id, ok: false, reason: 'No source URL' });
      continue;
    }

    const summary = await fetchPublicPageSummary(item.sourceUrl);
    if (!summary) {
      syncResults.push({ id: item.id, ok: false, reason: 'Source unreachable' });
      continue;
    }

    const updatedItem = {
      ...item,
      sourceMeta: summary,
      notes: item.notes || summary.description || `Source updated from ${item.sourceType}`,
      lastSeen: 'Just now',
      updatedAt: new Date().toISOString(),
      score: computeWatchlistScore({ ...item, sourceMeta: summary })
    };

    const index = list.findIndex((entry) => entry.id === item.id);
    if (index !== -1) {
      list[index] = updatedItem;
    }

    syncResults.push({ id: item.id, ok: true, title: summary.title || item.name, score: updatedItem.score });
  }

  writeWatchlist(list);
  return {
    synced: syncResults.filter((item) => item.ok).length,
    total: list.length,
    items: syncResults
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

  if (parsedUrl.pathname === '/api/watchlist') {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      const data = readWatchlist().map((item) => ({ ...item, score: computeWatchlistScore(item) }));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST') {
      try {
        const payload = await parseBody(req);
        const list = readWatchlist();
        const item = normalizeWatchlistItem({
          ...payload,
          id: payload.id || `watch-${Date.now()}`,
          score: computeWatchlistScore({ ...payload, status: payload.status || 'Monitoring', risk: payload.risk || 'Medium', category: payload.category || 'General' })
        });
        list.unshift(item);
        writeWatchlist(list);
        sendJson(res, 201, item);
      } catch (error) {
        sendJson(res, 400, { message: error.message || 'Invalid watchlist payload' });
      }
      return;
    }

    if (req.method === 'PUT') {
      try {
        const payload = await parseBody(req);
        const list = readWatchlist();
        const index = list.findIndex((item) => item.id === payload.id);
        if (index === -1) {
          sendJson(res, 404, { message: 'Watchlist item not found' });
          return;
        }

        list[index] = normalizeWatchlistItem({
          ...list[index],
          ...payload,
          updatedAt: new Date().toISOString(),
          score: computeWatchlistScore({ ...list[index], ...payload })
        });
        writeWatchlist(list);
        sendJson(res, 200, list[index]);
      } catch (error) {
        sendJson(res, 400, { message: error.message || 'Invalid watchlist payload' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { message: 'Missing id' });
        return;
      }

      const list = readWatchlist();
      const filtered = list.filter((item) => item.id !== id);
      if (filtered.length === list.length) {
        sendJson(res, 404, { message: 'Watchlist item not found' });
        return;
      }

      writeWatchlist(filtered);
      sendJson(res, 200, { message: 'Watchlist item deleted successfully' });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/watchlist/sync') {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      try {
        const itemId = parsedUrl.searchParams.get('id');
        if (itemId) {
          const result = await syncWatchlistItemById(itemId);
          if (!result) {
            sendJson(res, 404, { message: 'Watchlist item not found' });
            return;
          }
          sendJson(res, 200, { item: result, score: computeWatchlistScore(result) });
          return;
        }

        const result = await syncWatchlistSources();
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { message: error.message || 'Watchlist sync failed' });
      }
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

server.listen(PORT, () => {
  console.log(`AgentRam API running at http://localhost:${PORT}`);
  console.log('Default login: admin / admin123');
  console.log('BNB Agent lookup: /api/bnb/lookup?agentId=123&network=bsc-mainnet');
  console.log('Project watchlist: /api/watchlist');
  console.log('Project watchlist sync: /api/watchlist/sync');
});

module.exports = server;
