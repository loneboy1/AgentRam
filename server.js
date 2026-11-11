const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'agents.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
const sessions = new Map();
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_HISTORY = 50;

const BNB_NETWORKS = {
  'bsc-mainnet': {
    name: 'bsc-mainnet', chainId: 56,
    registryContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    scanApi: 'https://www.8004scan.io/api/v1'
  },
  'bsc-testnet': {
    name: 'bsc-testnet', chainId: 97,
    registryContract: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    scanApi: 'https://www.8004scan.io/api/v1'
  }
};

function ensureJsonFile(filePath, defaultData) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
}

function ensureSeedData() {
  ensureJsonFile(DATA_FILE, [
    { id: 'FA-1024', name: 'Maya Rafi', wallet: '0xA4D8...2201', status: 'Active', risk: 'Low', trust: 94, lastSync: '2 min ago', notes: 'Stable sync and healthy latency' },
    { id: 'FA-1031', name: 'Nadya Chen', wallet: '0xC11A...9E20', status: 'Pending', risk: 'Medium', trust: 78, lastSync: '14 min ago', notes: 'Waiting for validation check' },
    { id: 'FA-1045', name: 'Rian Suryadi', wallet: '0x71B2...EE89', status: 'Alert', risk: 'High', trust: 52, lastSync: '5 min ago', notes: 'Repeated failed node heartbeat' }
  ]);
  ensureJsonFile(USERS_FILE, [{ username: 'admin', password: 'admin123', role: 'admin' }]);
  ensureJsonFile(WATCHLIST_FILE, []);
}

function readJson(filePath) {
  ensureSeedData();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}

function normalizeTags(value) {
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 30);
}

function normalizeWatchlistItem(item = {}) {
  return {
    id: String(item.id || `watch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`),
    name: String(item.name || 'Unnamed Project').slice(0, 120),
    agentId: String(item.agentId || '').slice(0, 120),
    category: String(item.category || 'General').slice(0, 60),
    sourceType: String(item.sourceType || 'website').slice(0, 40),
    sourceUrl: String(item.sourceUrl || '').slice(0, 2048),
    status: String(item.status || 'Monitoring'),
    risk: String(item.risk || 'Medium'),
    platform: String(item.platform || 'Other').slice(0, 60),
    lastSeen: String(item.lastSeen || 'Not checked'),
    lastCheckedAt: item.lastCheckedAt || null,
    tags: normalizeTags(item.tags),
    notes: String(item.notes || '').slice(0, 4000),
    sourceMeta: item.sourceMeta && typeof item.sourceMeta === 'object' ? item.sourceMeta : null,
    history: Array.isArray(item.history) ? item.history.slice(-MAX_HISTORY) : [],
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function readWatchlist() {
  const data = readJson(WATCHLIST_FILE);
  return Array.isArray(data) ? data.map(normalizeWatchlistItem) : [];
}

function writeWatchlist(data) { writeJson(WATCHLIST_FILE, data.map(normalizeWatchlistItem)); }

function addHistory(item, type, message, metadata = {}) {
  const event = { id: crypto.randomUUID(), type, message, at: new Date().toISOString(), ...metadata };
  item.history = [...(item.history || []), event].slice(-MAX_HISTORY);
  return event;
}

function computeWatchlistScore(item) {
  const statusWeight = { Verified: 25, Monitoring: 18, 'Needs Review': 12, Deprecated: 5 };
  const riskWeight = { Low: 10, Medium: 6, High: 3 };
  const categoryWeight = { Launch: 18, Campaign: 16, Freemint: 15, Reward: 14, Claim: 12, Partner: 10, General: 8 };
  return Math.min(
    100,
    (statusWeight[item.status] || 10) + (riskWeight[item.risk] || 6) +
      (categoryWeight[item.category] || 8) + (item.sourceMeta ? 10 : 0) +
      Math.min((item.tags || []).length * 2, 12)
  );
}

function scoreLabel(score) {
  if (score >= 80) return 'Strong signal';
  if (score >= 60) return 'Watching';
  if (score >= 40) return 'Review';
  return 'Low priority';
}

function getUserFromDb(username, password) {
  return readJson(USERS_FILE).find((user) => user.username === username && user.password === password) || null;
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
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON payload')); }
    });
    req.on('error', reject);
  });
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) {
    const ip = address.toLowerCase();
    return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') ||
      /^fe[89ab]/.test(ip) || ip.startsWith('::ffff:') || ip.startsWith('2001:db8:');
  }
  return true;
}

async function validatePublicHttpsUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid source URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Sources must use a public HTTPS URL');
  }
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private or local source hosts are not allowed');
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Private or local source hosts are not allowed');
  } else {
    let addresses;
    try { addresses = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error('Could not resolve source host'); }
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('Source host resolves to a private or local address');
    }
  }
  return url;
}

async function fetchPublicPageSummary(sourceUrl) {
  let currentUrl = sourceUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const url = await validatePublicHttpsUrl(currentUrl);
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'AgentRam-Monitor/1.0 (+public-source-metadata)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9'
      },
      signal: AbortSignal.timeout(12000)
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('Source redirected too many times');
      currentUrl = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error('Source is not an HTML page');
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_SOURCE_BYTES) throw new Error('Source page is too large');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Source response is empty');
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error('Source page is too large');
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    const descriptionMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/is);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/is);
    const decodeEntities = (text) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return {
      title: decodeEntities((ogTitle?.[1] || titleMatch?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 300),
      description: decodeEntities((descriptionMatch?.[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 1200),
      url: url.toString(),
      checkedAt: new Date().toISOString(),
      contentHash: crypto.createHash('sha256').update(html).digest('hex')
    };
  }
  throw new Error('Could not fetch source');
}

async function syncOne(itemId) {
  const list = readWatchlist();
  const index = list.findIndex((entry) => entry.id === itemId);
  if (index < 0) return null;
  const item = list[index];
  if (!item.sourceUrl) throw new Error('Project has no source URL');
  const summary = await fetchPublicPageSummary(item.sourceUrl);
  const previous = item.sourceMeta;
  const changed = Boolean(previous && previous.contentHash !== summary.contentHash);
  const next = {
    ...item,
    sourceMeta: summary,
    lastSeen: new Date().toISOString(),
    lastCheckedAt: summary.checkedAt,
    updatedAt: new Date().toISOString()
  };
  if (!previous) addHistory(next, 'source_checked', 'Public source checked for the first time.', { sourceUrl: summary.url });
  else if (changed) addHistory(next, 'source_changed', 'Public source content changed.', { sourceUrl: summary.url, previousHash: previous.contentHash, contentHash: summary.contentHash });
  else addHistory(next, 'source_checked', 'Public source checked; no content change detected.', { sourceUrl: summary.url });
  list[index] = next;
  writeWatchlist(list);
  return { ...next, score: computeWatchlistScore(next), scoreLabel: scoreLabel(computeWatchlistScore(next)), sourceChanged: changed };
}

async function syncAll() {
  const list = readWatchlist();
  const results = [];
  for (const item of list) {
    try {
      const synced = await syncOne(item.id);
      results.push({ id: item.id, ok: true, sourceChanged: synced.sourceChanged, score: synced.score });
    } catch (error) {
      results.push({ id: item.id, ok: false, error: error.message });
    }
  }
  return { total: results.length, synced: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, items: results };
}

function getWatchlistAlerts() {
  const alerts = [];
  for (const item of readWatchlist()) {
    const score = computeWatchlistScore(item);
    if (item.status === 'Needs Review') alerts.push({ id: `status-${item.id}`, itemId: item.id, project: item.name, severity: 'warning', type: 'review', message: 'Project needs review', at: item.updatedAt });
    if (item.risk === 'High') alerts.push({ id: `risk-${item.id}`, itemId: item.id, project: item.name, severity: 'high', type: 'risk', message: 'Project is marked high risk', at: item.updatedAt });
    for (const event of item.history || []) {
      if (event.type === 'source_changed') alerts.push({ id: event.id, itemId: item.id, project: item.name, severity: 'info', type: event.type, message: event.message, at: event.at });
    }
    if (score >= 80) alerts.push({ id: `score-${item.id}`, itemId: item.id, project: item.name, severity: 'info', type: 'signal', message: `Strong signal score (${score})`, at: item.updatedAt });
  }
  return alerts.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 100);
}

function decodeAgentUri(agentUri) {
  if (!agentUri || typeof agentUri !== 'string') return null;
  try {
    if (agentUri.startsWith('data:application/json;base64,')) {
      return JSON.parse(Buffer.from(agentUri.replace(/^data:application\/json;base64,/i, ''), 'base64').toString('utf8'));
    }
  } catch {}
  return null;
}

function normalizeAgentLookup(item) {
  const tokenId = item?.token_id ?? item?.agentId ?? item?.id ?? null;
  const agentUri = item?.agent_uri ?? item?.agentUri ?? '';
  const decodedAgentUri = decodeAgentUri(agentUri);
  const textBlob = [item?.name, item?.description, agentUri, decodedAgentUri ? JSON.stringify(decodedAgentUri) : '', ...(Array.isArray(item?.services) ? item.services.map((service) => JSON.stringify(service)) : [])].join(' ').toLowerCase();
  return {
    agentId: tokenId !== null && tokenId !== undefined ? Number(tokenId) : null,
    name: item?.name || '',
    ownerAddress: item?.owner_address ?? item?.ownerAddress ?? '',
    network: item?.network || 'bsc-mainnet',
    registryContract: item?.registryContract || item?.registry_contract || '',
    agentUri,
    decodedAgentUri,
    freemintCandidate: /(freemint|free[-\s]?mint|minting|launchpad|campaign)/i.test(textBlob),
    description: item?.description || '',
    source: '8004scan indexer'
  };
}

async function fetchBnbAgents(networkName = 'bsc-mainnet') {
  const network = BNB_NETWORKS[networkName] || BNB_NETWORKS['bsc-mainnet'];
  const url = new URL(`${network.scanApi}/agents`);
  url.searchParams.set('chain_id', String(network.chainId));
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', '0');
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`8004scan API request failed: ${response.status}`);
  const data = await response.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  return { network: network.name, registryContract: network.registryContract, total: Number(data?.total ?? items.length), items: items.map(normalizeAgentLookup) };
}

async function lookupBnbAgent({ agentId, wallet, name, network = 'bsc-mainnet' }) {
  const networkName = BNB_NETWORKS[network] ? network : 'bsc-mainnet';
  const { items, total, registryContract } = await fetchBnbAgents(networkName);
  let filtered = items;
  if (agentId !== undefined && agentId !== null && agentId !== '') filtered = filtered.filter((item) => String(item.agentId) === String(agentId));
  if (wallet) filtered = filtered.filter((item) => String(item.ownerAddress || '').toLowerCase() === wallet.toLowerCase());
  if (name) filtered = filtered.filter((item) => String(item.name || '').toLowerCase().includes(name.toLowerCase()));
  return { network: networkName, registryContract, total, matched: filtered.length, results: filtered.slice(0, 25), source: '8004scan indexer' };
}

function requireSession(req, res) {
  if (getSessionFromRequest(req)) return true;
  sendJson(res, 401, { message: 'Unauthorized' });
  return false;
}

const server = http.createServer(async (req, res) => {
  let parsedUrl;
  try { parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { sendJson(res, 400, { message: 'Invalid URL' }); return; }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    res.end(); return;
  }
  if (parsedUrl.pathname === '/api/health') { sendJson(res, 200, { ok: true, service: 'AgentRam API' }); return; }

  if (parsedUrl.pathname === '/api/login') {
    if (req.method !== 'POST') { sendJson(res, 405, { message: 'Method not allowed' }); return; }
    try {
      const body = await parseBody(req);
      const user = getUserFromDb(body.username || '', body.password || '');
      if (!user) { sendJson(res, 401, { message: 'Username atau password salah.' }); return; }
      const token = createSession(user.username);
      sendJson(res, 200, { token, user: { username: user.username, role: user.role } });
    } catch (error) { sendJson(res, 400, { message: error.message }); }
    return;
  }

  if (parsedUrl.pathname === '/api/me') {
    if (req.method !== 'GET') { sendJson(res, 405, { message: 'Method not allowed' }); return; }
    const session = getSessionFromRequest(req);
    if (!session) { sendJson(res, 401, { message: 'Unauthorized' }); return; }
    sendJson(res, 200, { username: session.username, role: 'admin' }); return;
  }

  if (parsedUrl.pathname === '/api/agents') {
    if (!requireSession(req, res)) return;
    try {
      if (req.method === 'GET') { sendJson(res, 200, readJson(DATA_FILE)); return; }
      if (req.method === 'POST') {
        const payload = await parseBody(req);
        const list = readJson(DATA_FILE);
        if (list.some((item) => item.id === payload.id)) { sendJson(res, 409, { message: 'Agent ID already exists' }); return; }
        list.unshift(payload); writeJson(DATA_FILE, list); sendJson(res, 201, payload); return;
      }
      if (req.method === 'PUT') {
        const payload = await parseBody(req);
        const list = readJson(DATA_FILE); const index = list.findIndex((item) => item.id === payload.id);
        if (index < 0) { sendJson(res, 404, { message: 'Agent not found' }); return; }
        list[index] = { ...list[index], ...payload }; writeJson(DATA_FILE, list); sendJson(res, 200, list[index]); return;
      }
      if (req.method === 'DELETE') {
        const id = parsedUrl.searchParams.get('id'); const list = readJson(DATA_FILE); const filtered = list.filter((item) => item.id !== id);
        if (!id || filtered.length === list.length) { sendJson(res, 404, { message: 'Agent not found' }); return; }
        writeJson(DATA_FILE, filtered); sendJson(res, 200, { message: 'Agent deleted successfully' }); return;
      }
      sendJson(res, 405, { message: 'Method not allowed' });
    } catch (error) { sendJson(res, 400, { message: error.message || 'Invalid request' }); }
    return;
  }

  if (parsedUrl.pathname === '/api/watchlist/alerts') {
    if (!requireSession(req, res)) return;
    if (req.method !== 'GET') { sendJson(res, 405, { message: 'Method not allowed' }); return; }
    sendJson(res, 200, getWatchlistAlerts()); return;
  }

  if (parsedUrl.pathname === '/api/watchlist/sync') {
    if (!requireSession(req, res)) return;
    if (req.method !== 'POST') { sendJson(res, 405, { message: 'Use POST to refresh monitored sources' }); return; }
    try {
      const itemId = parsedUrl.searchParams.get('id');
      if (itemId) {
        const item = await syncOne(itemId);
        if (!item) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
        sendJson(res, 200, { item }); return;
      }
      sendJson(res, 200, await syncAll());
    } catch (error) { sendJson(res, 502, { message: error.message || 'Watchlist sync failed' }); }
    return;
  }

  const detailMatch = parsedUrl.pathname.match(/^\/api\/watchlist\/([^/]+)$/);
  if (detailMatch) {
    if (!requireSession(req, res)) return;
    if (req.method !== 'GET') { sendJson(res, 405, { message: 'Method not allowed' }); return; }
    const item = readWatchlist().find((entry) => entry.id === decodeURIComponent(detailMatch[1]));
    if (!item) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
    const score = computeWatchlistScore(item);
    sendJson(res, 200, { ...item, score, scoreLabel: scoreLabel(score), alerts: getWatchlistAlerts().filter((alert) => alert.itemId === item.id) });
    return;
  }

  if (parsedUrl.pathname === '/api/watchlist') {
    if (!requireSession(req, res)) return;
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, readWatchlist().map((item) => { const score = computeWatchlistScore(item); return { ...item, score, scoreLabel: scoreLabel(score) }; })); return;
      }
      if (req.method === 'POST') {
        const payload = await parseBody(req);
        if (!payload.name || !payload.agentId) { sendJson(res, 400, { message: 'Project name and Agent ID are required' }); return; }
        if (payload.sourceUrl) await validatePublicHttpsUrl(payload.sourceUrl);
        const list = readWatchlist();
        const id = payload.id || `watch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        if (list.some((item) => item.id === id)) { sendJson(res, 409, { message: 'Watchlist ID already exists' }); return; }
        const item = normalizeWatchlistItem({ ...payload, id, history: [] });
        addHistory(item, 'created', 'Project added to watchlist.');
        list.unshift(item); writeWatchlist(list);
        const score = computeWatchlistScore(item); sendJson(res, 201, { ...item, score, scoreLabel: scoreLabel(score) }); return;
      }
      if (req.method === 'PUT') {
        const payload = await parseBody(req);
        const list = readWatchlist(); const index = list.findIndex((item) => item.id === payload.id);
        if (index < 0) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
        if (payload.sourceUrl) await validatePublicHttpsUrl(payload.sourceUrl);
        const previous = list[index];
        const next = normalizeWatchlistItem({ ...previous, ...payload, id: previous.id, updatedAt: new Date().toISOString() });
        if (payload.status && payload.status !== previous.status) addHistory(next, 'status_changed', `Status changed from ${previous.status} to ${payload.status}.`, { from: previous.status, to: payload.status });
        if (payload.sourceUrl && payload.sourceUrl !== previous.sourceUrl) addHistory(next, 'source_added', 'Project source URL changed.', { sourceUrl: payload.sourceUrl });
        list[index] = next; writeWatchlist(list);
        const score = computeWatchlistScore(next); sendJson(res, 200, { ...next, score, scoreLabel: scoreLabel(score) }); return;
      }
      if (req.method === 'DELETE') {
        const id = parsedUrl.searchParams.get('id'); const list = readWatchlist(); const filtered = list.filter((item) => item.id !== id);
        if (!id || filtered.length === list.length) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
        writeWatchlist(filtered); sendJson(res, 200, { message: 'Watchlist item deleted successfully' }); return;
      }
      sendJson(res, 405, { message: 'Method not allowed' });
    } catch (error) { sendJson(res, 400, { message: error.message || 'Invalid watchlist request' }); }
    return;
  }

  if (parsedUrl.pathname === '/api/bnb/lookup') {
    if (!requireSession(req, res)) return;
    try {
      let filters;
      if (req.method === 'GET') filters = { agentId: parsedUrl.searchParams.get('agentId'), wallet: parsedUrl.searchParams.get('wallet'), name: parsedUrl.searchParams.get('name'), network: parsedUrl.searchParams.get('network') || 'bsc-mainnet' };
      else if (req.method === 'POST') filters = await parseBody(req);
      else { sendJson(res, 405, { message: 'Method not allowed' }); return; }
      sendJson(res, 200, await lookupBnbAgent(filters));
    } catch (error) { sendJson(res, 502, { message: error.message || 'BNB lookup failed' }); }
    return;
  }

  if (parsedUrl.pathname === '/api/bnb/health') {
    if (!requireSession(req, res)) return;
    sendJson(res, 200, { ok: true, network: 'bsc-mainnet', registryContract: BNB_NETWORKS['bsc-mainnet'].registryContract, source: '8004scan indexer' }); return;
  }

  sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`AgentRam API running at http://localhost:${PORT}`);
  console.log('Default login: admin / admin123');
  console.log('Project watchlist: /api/watchlist');
  console.log('Watchlist alerts: /api/watchlist/alerts');
  console.log('Sync sources with POST /api/watchlist/sync');
});

module.exports = server;
