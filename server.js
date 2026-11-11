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
const EVENTS_FILE = path.join(DATA_DIR, 'watchlist-events.json');
const sessions = new Map();
const MAX_BODY_BYTES = 1024 * 1024;

const BNB_NETWORKS = {
  'bsc-mainnet': { name: 'bsc-mainnet', chainId: 56, registryContract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', scanApi: 'https://www.8004scan.io/api/v1' },
  'bsc-testnet': { name: 'bsc-testnet', chainId: 97, registryContract: '0x8004A818BFB912233c491871b3d84c89A494BD9e', scanApi: 'https://www.8004scan.io/api/v1' }
};

function ensureFile(file, initial) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial, null, 2));
}
function ensureData() {
  ensureFile(DATA_FILE, []);
  ensureFile(USERS_FILE, [{ username: 'admin', password: 'admin123', role: 'admin' }]);
  ensureFile(WATCHLIST_FILE, []);
  ensureFile(EVENTS_FILE, []);
}
function readJson(file) {
  ensureData();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  ensureData();
  const tempFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2));
  fs.renameSync(tempFile, file);
}
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
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
function getSession(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return sessions.get(token) || null;
}
function requireSession(req, res) {
  if (getSession(req)) return true;
  sendJson(res, 401, { message: 'Unauthorized' });
  return false;
}
function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 30);
  return typeof value === 'string' ? value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 30) : [];
}
function normalizeWatchlistItem(item = {}) {
  return {
    id: String(item.id || `watch-${crypto.randomUUID()}`),
    name: String(item.name || 'Unnamed Project').slice(0, 160),
    agentId: String(item.agentId || '').slice(0, 120),
    category: String(item.category || 'General').slice(0, 80),
    sourceType: String(item.sourceType || 'website').slice(0, 40),
    sourceUrl: String(item.sourceUrl || '').slice(0, 2048),
    status: ['Monitoring', 'Needs Review', 'Verified', 'Deprecated'].includes(item.status) ? item.status : 'Monitoring',
    risk: ['Low', 'Medium', 'High'].includes(item.risk) ? item.risk : 'Medium',
    platform: String(item.platform || 'Other').slice(0, 60),
    lastSeen: item.lastSeen || null,
    lastCheckedAt: item.lastCheckedAt || null,
    tags: normalizeTags(item.tags),
    notes: String(item.notes || '').slice(0, 4000),
    sourceMeta: item.sourceMeta || null,
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}
function readWatchlist() {
  return readJson(WATCHLIST_FILE).map(normalizeWatchlistItem);
}
function writeWatchlist(items) {
  writeJson(WATCHLIST_FILE, items.map(normalizeWatchlistItem));
}
function addEvent(projectId, type, message, source = 'system', details = {}) {
  const events = readJson(EVENTS_FILE);
  const event = { id: crypto.randomUUID(), projectId, type, message: String(message).slice(0, 500), source, details, createdAt: new Date().toISOString() };
  events.unshift(event);
  writeJson(EVENTS_FILE, events.slice(0, 5000));
  return event;
}
function riskPoints(risk) { return ({ Low: 10, Medium: 6, High: 2 })[risk] || 5; }
function computeScore(item) {
  const status = ({ Verified: 25, Monitoring: 18, 'Needs Review': 10, Deprecated: 0 })[item.status] ?? 10;
  const categories = ({ Launch: 18, Campaign: 16, Freemint: 14, Reward: 13, Claim: 12, Partner: 10, General: 8 });
  const sourceBonus = item.sourceMeta ? 10 : 0;
  const agentIdBonus = item.agentId ? 8 : 0;
  const tagBonus = Math.min((item.tags || []).length * 2, 12);
  return Math.max(0, Math.min(100, status + riskPoints(item.risk) + (categories[item.category] || 8) + sourceBonus + agentIdBonus + tagBonus));
}
function scoreLabel(score) {
  if (score >= 80) return 'Strong signal';
  if (score >= 60) return 'Watching';
  if (score >= 40) return 'Review';
  return 'Low priority';
}
function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.');
  }
  return true;
}
async function validatePublicHttpsUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Source URL is invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only public HTTPS source URLs are allowed');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Local network sources are not allowed');
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Private or reserved IP addresses are not allowed');
  } else {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Source host resolves to a private or reserved address');
  }
  return url;
}
async function fetchPublicPageSummary(rawUrl) {
  let url;
  try { url = await validatePublicHttpsUrl(rawUrl); } catch (error) { return { error: error.message }; }
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'AgentRam-Monitor/1.0', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(12000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { error: 'Source redirected without a location' };
      const redirectUrl = new URL(location, url);
      if (redirectUrl.hostname !== url.hostname) return { error: 'Cross-host redirects are not followed; save the final public URL' };
      const checked = await validatePublicHttpsUrl(redirectUrl.toString());
      const redirected = await fetch(checked, { redirect: 'manual', headers: { 'User-Agent': 'AgentRam-Monitor/1.0', Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(12000) });
      if (!redirected.ok) return { error: `Source returned HTTP ${redirected.status}` };
      return parsePageResponse(redirected, checked.toString());
    }
    if (!response.ok) return { error: `Source returned HTTP ${response.status}` };
    return parsePageResponse(response, url.toString());
  } catch (error) {
    return { error: error.name === 'TimeoutError' ? 'Source request timed out' : 'Could not fetch source' };
  }
}
async function parsePageResponse(response, url) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return { error: 'Source is not an HTML page' };
  const html = (await response.text()).slice(0, 2_000_000);
  const getMeta = (pattern) => html.match(pattern)?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim() || '';
  const title = getMeta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i) || getMeta(/<title[^>]*>(.*?)<\/title>/is);
  const description = getMeta(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  return { title: title.slice(0, 300), description: description.slice(0, 1200), url, checkedAt: new Date().toISOString() };
}
async function syncOne(itemId) {
  const list = readWatchlist();
  const index = list.findIndex((entry) => entry.id === itemId);
  if (index < 0) return null;
  const item = list[index];
  const previous = item.sourceMeta;
  if (!item.sourceUrl) {
    item.lastCheckedAt = new Date().toISOString();
    addEvent(item.id, 'sync_failed', 'No source URL configured', item.sourceType);
  } else {
    const result = await fetchPublicPageSummary(item.sourceUrl);
    item.lastCheckedAt = new Date().toISOString();
    if (result?.error) {
      addEvent(item.id, 'sync_failed', result.error, item.sourceType, { url: item.sourceUrl });
      item.sourceError = result.error;
    } else {
      const changed = !previous || previous.title !== result.title || previous.description !== result.description;
      item.sourceMeta = result;
      item.lastSeen = result.checkedAt;
      delete item.sourceError;
      if (changed) addEvent(item.id, previous ? 'source_changed' : 'source_discovered', previous ? 'Public source metadata changed' : 'Public source metadata discovered', item.sourceType, { url: result.url, title: result.title });
      else addEvent(item.id, 'source_checked', 'Public source checked; no metadata change', item.sourceType, { url: result.url });
    }
  }
  item.score = computeScore(item);
  item.updatedAt = new Date().toISOString();
  list[index] = item;
  writeWatchlist(list);
  return item;
}
async function syncAll() {
  const snapshot = readWatchlist();
  const results = [];
  for (const item of snapshot) {
    try {
      const updated = await syncOne(item.id);
      results.push({ id: item.id, ok: Boolean(updated && !updated.sourceError), error: updated?.sourceError || null });
    } catch (error) {
      results.push({ id: item.id, ok: false, error: 'Sync failed' });
    }
  }
  return { total: results.length, synced: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, items: results };
}
function getAlerts() {
  const items = readWatchlist();
  const alerts = [];
  for (const item of items) {
    const score = computeScore(item);
    if (item.status === 'Needs Review') alerts.push({ id: `status-${item.id}`, projectId: item.id, level: 'warning', type: 'review', message: `${item.name}: needs review`, createdAt: item.updatedAt });
    if (item.risk === 'High') alerts.push({ id: `risk-${item.id}`, projectId: item.id, level: 'high', type: 'risk', message: `${item.name}: high risk is marked`, createdAt: item.updatedAt });
    if (item.sourceError) alerts.push({ id: `source-${item.id}`, projectId: item.id, level: 'warning', type: 'source_error', message: `${item.name}: ${item.sourceError}`, createdAt: item.lastCheckedAt || item.updatedAt });
    if (score >= 80) alerts.push({ id: `signal-${item.id}`, projectId: item.id, level: 'info', type: 'signal', message: `${item.name}: strong watchlist signal (score ${score})`, createdAt: item.updatedAt });
  }
  const events = readJson(EVENTS_FILE).filter((event) => ['source_changed', 'source_discovered', 'status_changed'].includes(event.type)).slice(0, 100);
  for (const event of events) alerts.push({ id: event.id, projectId: event.projectId, level: 'info', type: event.type, message: event.message, createdAt: event.createdAt });
  return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
}
function normalizeAgentLookup(item) {
  const tokenId = item?.token_id ?? item?.agentId ?? item?.id ?? null;
  const ownerAddress = item?.owner_address ?? item?.ownerAddress ?? '';
  const agentUri = item?.agent_uri ?? item?.agentUri ?? '';
  return { agentId: tokenId !== null ? Number(tokenId) : null, name: item?.name || '', ownerAddress, agentUri, description: item?.description || '', network: item?.network || 'bsc-mainnet', registryContract: item?.registry_contract || '', source: '8004scan indexer', raw: item };
}
async function lookupBnbAgent({ agentId, wallet, name, network = 'bsc-mainnet' }) {
  const config = BNB_NETWORKS[network] || BNB_NETWORKS['bsc-mainnet'];
  const url = new URL(`${config.scanApi}/agents`);
  url.searchParams.set('chain_id', String(config.chainId));
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', '0');
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`8004scan API request failed: ${response.status}`);
  const data = await response.json();
  let items = (Array.isArray(data?.items) ? data.items : []).map(normalizeAgentLookup);
  if (agentId) items = items.filter((item) => String(item.agentId) === String(agentId));
  if (wallet) items = items.filter((item) => item.ownerAddress.toLowerCase() === wallet.toLowerCase());
  if (name) items = items.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()));
  return { network: config.name, registryContract: config.registryContract, total: Number(data?.total ?? items.length), matched: items.length, results: items.slice(0, 25), source: '8004scan indexer' };
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { sendJson(res, 400, { message: 'Invalid URL' }); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); res.end(); return; }
  if (url.pathname === '/api/health') { sendJson(res, 200, { ok: true, service: 'AgentRam API' }); return; }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const user = readJson(USERS_FILE).find((candidate) => candidate.username === body.username && candidate.password === body.password);
      if (!user) { sendJson(res, 401, { message: 'Username atau password salah.' }); return; }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { username: user.username, createdAt: Date.now() });
      sendJson(res, 200, { token, user: { username: user.username, role: user.role || 'admin' } });
    } catch (error) { sendJson(res, 400, { message: error.message }); }
    return;
  }
  if (url.pathname === '/api/me') {
    if (req.method !== 'GET') { sendJson(res, 405, { message: 'Method not allowed' }); return; }
    if (!requireSession(req, res)) return;
    const user = getSession(req); sendJson(res, 200, { username: user.username, role: 'admin' }); return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (!requireSession(req, res)) return;
  }

  if (url.pathname === '/api/agents') {
    const agents = readJson(DATA_FILE);
    if (req.method === 'GET') { sendJson(res, 200, agents); return; }
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        const body = await parseBody(req);
        if (!body.id || !body.name) { sendJson(res, 400, { message: 'Agent ID and name are required' }); return; }
        const index = agents.findIndex((agent) => agent.id === body.id);
        if (req.method === 'POST' && index >= 0) { sendJson(res, 409, { message: 'Agent ID already exists' }); return; }
        const value = req.method === 'POST' ? body : index < 0 ? null : { ...agents[index], ...body };
        if (!value) { sendJson(res, 404, { message: 'Agent not found' }); return; }
        if (req.method === 'POST') agents.unshift(value); else agents[index] = value;
        writeJson(DATA_FILE, agents); sendJson(res, req.method === 'POST' ? 201 : 200, value);
      } catch (error) { sendJson(res, 400, { message: error.message }); }
      return;
    }
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id'); const next = agents.filter((agent) => agent.id !== id);
      if (next.length === agents.length) { sendJson(res, 404, { message: 'Agent not found' }); return; }
      writeJson(DATA_FILE, next); sendJson(res, 200, { message: 'Agent deleted successfully' }); return;
    }
  }

  if (url.pathname === '/api/watchlist') {
    const list = readWatchlist();
    if (req.method === 'GET') {
      const withScores = list.map((item) => ({ ...item, score: computeScore(item), signal: scoreLabel(computeScore(item)) }));
      sendJson(res, 200, withScores); return;
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        const body = await parseBody(req);
        if (!body.name || !body.agentId) { sendJson(res, 400, { message: 'Project name and Agent ID are required' }); return; }
        const index = list.findIndex((item) => item.id === body.id);
        if (req.method === 'PUT' && index < 0) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
        const old = index >= 0 ? list[index] : null;
        const item = normalizeWatchlistItem({ ...old, ...body, id: old?.id || `watch-${crypto.randomUUID()}`, updatedAt: new Date().toISOString() });
        item.score = computeScore(item);
        if (old) {
          if (old.status !== item.status) addEvent(item.id, 'status_changed', `Status changed from ${old.status} to ${item.status}`, 'user', { from: old.status, to: item.status });
          list[index] = item;
        } else {
          list.unshift(item); addEvent(item.id, 'project_added', `Added ${item.name} to watchlist`, 'user', { agentId: item.agentId });
        }
        writeWatchlist(list); sendJson(res, old ? 200 : 201, item);
      } catch (error) { sendJson(res, 400, { message: error.message }); }
      return;
    }
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id'); const next = list.filter((item) => item.id !== id);
      if (next.length === list.length) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
      writeWatchlist(next); addEvent(id, 'project_removed', 'Project removed from watchlist', 'user'); sendJson(res, 200, { message: 'Watchlist item deleted successfully' }); return;
    }
  }

  if (url.pathname.startsWith('/api/watchlist/')) {
    const suffix = url.pathname.slice('/api/watchlist/'.length);
    if (suffix === 'sync' && req.method === 'POST') {
      try {
        const id = url.searchParams.get('id');
        if (id) {
          const item = await syncOne(id);
          if (!item) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
          sendJson(res, 200, { item, score: computeScore(item) }); return;
        }
        sendJson(res, 200, await syncAll());
      } catch (error) { sendJson(res, 500, { message: error.message || 'Watchlist sync failed' }); }
      return;
    }
    if (suffix === 'alerts' && req.method === 'GET') { sendJson(res, 200, getAlerts()); return; }
    if (suffix === 'events' && req.method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const events = readJson(EVENTS_FILE).filter((event) => !projectId || event.projectId === projectId).slice(0, 200);
      sendJson(res, 200, events); return;
    }
    if (req.method === 'GET' && suffix) {
      const item = readWatchlist().find((entry) => entry.id === decodeURIComponent(suffix));
      if (!item) { sendJson(res, 404, { message: 'Watchlist item not found' }); return; }
      const events = readJson(EVENTS_FILE).filter((event) => event.projectId === item.id).slice(0, 100);
      sendJson(res, 200, { ...item, score: computeScore(item), signal: scoreLabel(computeScore(item)), events }); return;
    }
  }

  if (url.pathname === '/api/bnb/lookup') {
    if (req.method !== 'GET') { sendJson(res, 405, { message: 'Method not allowed' }); return; }
    try {
      sendJson(res, 200, await lookupBnbAgent({ agentId: url.searchParams.get('agentId'), wallet: url.searchParams.get('wallet'), name: url.searchParams.get('name'), network: url.searchParams.get('network') || 'bsc-mainnet' }));
    } catch (error) { sendJson(res, 502, { message: error.message || 'BNB lookup failed' }); }
    return;
  }
  if (url.pathname === '/api/bnb/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, network: 'bsc-mainnet', registryContract: BNB_NETWORKS['bsc-mainnet'].registryContract, source: '8004scan indexer' }); return;
  }
  sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`AgentRam API running at http://localhost:${PORT}`);
  console.log('Default login: admin / admin123');
  console.log('Watchlist API: /api/watchlist');
  console.log('Sync all sources: POST /api/watchlist/sync');
  console.log('Alerts: GET /api/watchlist/alerts');
});

module.exports = server;
