const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
require('dotenv').config();

const PORT = Number(process.env.PORT) || 3000;

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

async function fetchBnbAgents(networkName = 'bsc-mainnet', offset = 0, limit = 100) {
  const network = BNB_NETWORKS[networkName] || BNB_NETWORKS['bsc-mainnet'];
  const url = new URL(`${network.scanApi}/agents`);
  url.searchParams.set('chain_id', String(network.chainId));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

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

// Freemint terbaru: indexer mengembalikan agent terbaru dulu (ID terbesar),
// tapi hanya ~1-2% yang lolos deteksi kata kunci freemint, jadi pindai
// beberapa halaman terbaru sampai target terpenuhi (maks 10 halaman).
async function listLatestFreemint({ network = 'bsc-mainnet', limit = 25 } = {}) {
  const networkName = BNB_NETWORKS[network] ? network : 'bsc-mainnet';
  const target = Math.max(1, Math.min(25, Number(limit) || 25));
  const PAGE_SIZE = 100;
  const BATCH_PAGES = 5;
  const MAX_BATCHES = 2;

  const byId = new Map();
  let total = 0;
  let scanned = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const offsets = Array.from({ length: BATCH_PAGES }, (_, i) => (batch * BATCH_PAGES + i) * PAGE_SIZE);
    const pages = await Promise.allSettled(offsets.map((offset) => fetchBnbAgents(networkName, offset, PAGE_SIZE)));
    for (const page of pages) {
      if (page.status !== 'fulfilled') continue;
      total = page.value.total || total;
      scanned += page.value.items.length;
      for (const item of page.value.items) {
        if (item.freemintCandidate && item.agentId !== null && item.agentId !== undefined) {
          byId.set(String(item.agentId), item);
        }
      }
    }
    if (byId.size >= target) break;
  }

  if (scanned === 0) {
    throw new Error('8004scan API request failed: no data');
  }

  const results = [...byId.values()].sort((a, b) => Number(b.agentId) - Number(a.agentId)).slice(0, target);

  return {
    network: networkName,
    total,
    scanned,
    matched: results.length,
    results,
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

  if (parsedUrl.pathname === '/api/bnb/lookup') {
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

  if (parsedUrl.pathname === '/api/bnb/freemint') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }
    try {
      const network = parsedUrl.searchParams.get('network') || 'bsc-mainnet';
      const limit = parsedUrl.searchParams.get('limit') || '25';
      const result = await listLatestFreemint({ network, limit });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { message: error.message || 'BNB freemint lookup failed' });
    }
    return;
  }

  if (parsedUrl.pathname === '/api/bnb/health') {
    sendJson(res, 200, {
      ok: true,
      network: 'bsc-mainnet',
      registryContract: BNB_NETWORKS['bsc-mainnet'].registryContract,
      source: '8004scan indexer',
      note: 'Official ERC-8004 registry lookup endpoint for BNB agent records.'
    });
    return;
  }
  if (!parsedUrl.pathname.startsWith('/api/')) {
    try {
      if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
        return;
      }
      if (parsedUrl.pathname === '/dashboard.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'dashboard.js')));
        return;
      }
      if (parsedUrl.pathname === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'styles.css')));
        return;
      }
      if (parsedUrl.pathname === '/about.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'about.html')));
        return;
      }
      if (parsedUrl.pathname === '/watchlist.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'watchlist.html')));
        return;
      }
      if (parsedUrl.pathname === '/agents.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'agents.json')));
        return;
      }
    } catch (error) {
      sendJson(res, 404, { message: 'Not found' });
      return;
    }
  }
  sendJson(res, 404, { message: 'Not found' });
});

if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`AgentRam API running at http://localhost:${PORT}`);
    console.log('BNB Agent lookup: /api/bnb/lookup?agentId=123&network=bsc-mainnet');
  });
}

module.exports = (req, res) => server.emit('request', req, res);
