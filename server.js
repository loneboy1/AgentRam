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

  const detail = {
    compositeId: item?.agent_id ?? '',
    contractAddress: item?.contract_address ?? item?.registryContract ?? item?.registry_contract ?? '',
    ownerEns: item?.owner_ens ?? null,
    ownerUsername: item?.owner_username ?? null,
    ownerAvatarUrl: item?.owner_avatar_url ?? null,
    ownerPublisherTier: item?.owner_publisher_tier ?? null,
    ownerCertifiedName: item?.owner_certified_name ?? null,
    imageUrl: item?.image_url ?? '',
    isVerified: Boolean(item?.is_verified),
    starCount: Number(item?.star_count ?? 0),
    supportedProtocols: Array.isArray(item?.supported_protocols) ? item.supported_protocols : [],
    x402Supported: Boolean(item?.x402_supported),
    totalScore: item?.total_score ?? null,
    rank: item?.rank ?? null,
    networkRank: item?.network_rank ?? null,
    healthScore: item?.health_score ?? null,
    totalFeedbacks: Number(item?.total_feedbacks ?? 0),
    averageScore: item?.average_score ?? null,
    crossChainVersions: Array.isArray(item?.cross_chain_versions) ? item.cross_chain_versions : [],
    createdAt: item?.created_at ?? null,
    updatedAt: item?.updated_at ?? null,
    chainId: item?.chain_id ?? null,
    chainType: item?.chain_type ?? ''
  };

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
    detail,
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

// Lookup lewat parameter search / owner_address indexer, BUKAN dengan
// mengambil 100 agent terbaru lalu memfilter di memori: agent yang sudah
// berumur sejam saja bisa jatuh keluar dari jendela 100 terbaru (416709
// sudah 111 di belakang yang terbaru) sehingga lookup mengembalikan 0.
async function lookupBnbAgent({ agentId, wallet, name, network = 'bsc-mainnet' }) {
  const networkName = BNB_NETWORKS[network] ? network : 'bsc-mainnet';
  const networkCfg = BNB_NETWORKS[networkName];
  const url = new URL(`${networkCfg.scanApi}/agents`);
  url.searchParams.set('chain_id', String(networkCfg.chainId));
  url.searchParams.set('limit', '25');
  url.searchParams.set('offset', '0');
  if (wallet) url.searchParams.set('owner_address', wallet);
  else if (agentId !== undefined && agentId !== null && agentId !== '') url.searchParams.set('search', String(agentId));
  else if (name) url.searchParams.set('search', name);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw new Error(`8004scan API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const items = (Array.isArray(data?.items) ? data.items : []).map(normalizeAgentLookup);

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
    registryContract: networkCfg.registryContract,
    total: Number(data?.total ?? items.length ?? 0),
    matched: filtered.length,
    results: filtered.slice(0, 25),
    source: '8004scan indexer'
  };
}

// Detail satu agent: pakai parameter search indexer (cocok persis untuk
// ID maupun nama). Kalau search tidak mengembalikan yang persis, pindai
// halaman terbaru (ID menurun) sampai ketemu atau sampai halaman sudah
// di bawah ID yang dicari — maks 10 halaman (1000 agent).
async function fetchBnbAgentById({ network = 'bsc-mainnet', agentId }) {
  const networkName = BNB_NETWORKS[network] ? network : 'bsc-mainnet';
  const networkCfg = BNB_NETWORKS[networkName];
  const wanted = String(agentId);

  const searchUrl = new URL(`${networkCfg.scanApi}/agents`);
  searchUrl.searchParams.set('chain_id', String(networkCfg.chainId));
  searchUrl.searchParams.set('search', wanted);
  searchUrl.searchParams.set('limit', '25');
  searchUrl.searchParams.set('offset', '0');

  const searchResponse = await fetch(searchUrl.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000)
  });
  if (!searchResponse.ok) {
    throw new Error(`8004scan API request failed: ${searchResponse.status} ${searchResponse.statusText}`);
  }
  const searchData = await searchResponse.json();
  const searchItems = Array.isArray(searchData?.items) ? searchData.items : [];
  const exact = searchItems.map(normalizeAgentLookup).find((item) => String(item.agentId) === wanted);
  if (exact) {
    return {
      network: networkName,
      registryContract: networkCfg.registryContract,
      total: Number(searchData?.total ?? 0),
      result: exact
    };
  }

  let scanned = 0;
  for (let page = 0; page < 10; page++) {
    const { items, total } = await fetchBnbAgents(networkName, page * 100, 100);
    scanned += items.length;
    const found = items.find((item) => String(item.agentId) === wanted);
    if (found) {
      return { network: networkName, registryContract: networkCfg.registryContract, total, result: found };
    }
    if (!items.length || items.length < 100) break;
    const maxId = Math.max(...items.map((item) => Number(item.agentId)).filter(Number.isFinite));
    if (Number.isFinite(maxId) && maxId < Number(wanted)) break;
  }

  return {
    network: networkName,
    registryContract: networkCfg.registryContract,
    total: Number(searchData?.total ?? 0),
    scanned,
    result: null
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
// ---- Freemint radar (NFT): gabungan 3 sumber no-key ----
// koncet = feed mint live (price_bnb == 0), Agent ID Hub = katalog
// proyek (cache 1 jam, 4,9 MB), datt.my = tabel MintRadar + safety.
// Tiap sumber dibungkus try/catch (Promise.allSettled) supaya satu
// sumber mati tidak menggagalkan seluruh radar.
const KONCET_BASE = 'https://ai.koncet.xyz';
const AGENTIDHUB_CATALOG_URL = 'https://agentidhub.eth.limo/project-catalog.js';
const DATT_BASE = 'https://datt.my';
const CATALOG_TTL_MS = 60 * 60 * 1000;
let radarCatalogCache = { at: 0, data: null };

async function fetchWithTimeout(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'AgentRam-radar/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} dari ${url}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function normRadarName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function radarRiskRank(risk) {
  const rank = { low: 0, medium: 1, high: 2, unknown: 3 }[String(risk || 'unknown').toLowerCase()];
  return rank === undefined ? 3 : rank;
}

async function fetchKoncetRadar() {
  const [feed, contracts] = await Promise.all([
    (await fetchWithTimeout(`${KONCET_BASE}/api/pulse/feed?limit=200`)).json(),
    (await fetchWithTimeout(`${KONCET_BASE}/api/pulse/contracts?limit=100`)).json()
  ]);
  const byContract = new Map();
  for (const entry of Array.isArray(contracts) ? contracts : []) {
    if (entry && entry.contract) byContract.set(String(entry.contract).toLowerCase(), entry);
  }
  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(feed) ? feed : []) {
    if (!entry || !entry.contract) continue;
    if (Number(entry.price_bnb) !== 0) continue;
    const contract = String(entry.contract).toLowerCase();
    if (seen.has(contract)) continue;
    seen.add(contract);
    const agg = byContract.get(contract) || {};
    const supply = agg.supply ?? null;
    const supplyMax = agg.supply_max ?? null;
    // Sisa supply langsung dari agregat (fallback hitung manual).
    const left = (agg.left !== null && agg.left !== undefined) ? agg.left
      : (supply !== null && supplyMax !== null) ? Math.max(supplyMax - supply, 0) : null;
    const soldOut = agg.sold_out === 1 || agg.sold_out === true || (left !== null && left <= 0);
    // firstSeen = KELAHIRAN project (mint pertama yang terindeks), bukan
    // mint terakhir — supaya daftar ini project yang FRESH, bukan project
    // lama yang kebetulan baru di-mint lagi.
    const birthTs = agg.first_indexed_mint_ts ?? null;
    items.push({
      contract,
      name: entry.contract_name || agg.name || contract,
      priceBnb: 0,
      priceSamples: entry.price_samples ?? agg.price_samples ?? null,
      supply, supplyMax, left, soldOut,
      mints: agg.agent_mints ?? entry.contract_mints ?? null,
      risk: 'unknown',
      safety: null,
      findings: null,
      firstSeen: birthTs ? new Date(Number(birthTs) * 1000).toISOString()
        : entry.ts ? new Date(Number(entry.ts) * 1000).toISOString() : null,
      lastMint: entry.ts ? new Date(Number(entry.ts) * 1000).toISOString() : null,
      sources: ['koncet']
    });
  }
  return items;
}

async function fetchCatalogRadar() {
  const now = Date.now();
  if (!radarCatalogCache.data || now - radarCatalogCache.at > CATALOG_TTL_MS) {
    const text = await (await fetchWithTimeout(AGENTIDHUB_CATALOG_URL, { timeoutMs: 30000 })).text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Format katalog Agent ID Hub tidak dikenal');
    radarCatalogCache = { at: now, data: JSON.parse(text.slice(start, end + 1)) };
  }
  const data = radarCatalogCache.data;
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const freeRe = /free|免费|gas only|gas-only/i;
  const items = [];
  for (const project of projects) {
    const verdict = project?.verdict || {};
    if (verdict.phase !== 'active') continue;
    if (String(verdict.risk || '').toLowerCase() === 'high') continue;
    const costText = `${(verdict.cost && verdict.cost.en) || ''} ${(verdict.cost && verdict.cost.zh) || ''}`.trim();
    if (!freeRe.test(costText)) continue;
    const progress = project?.mintProgress || null;
    if (!progress) continue;
    const minted = Number(progress.minted);
    const supply = Number(progress.supply);
    if (Number.isFinite(minted) && Number.isFinite(supply) && supply > 0 && minted >= supply) continue;
    items.push({
      contract: null,
      name: project.name || project.id || '—',
      priceBnb: null,
      costText,
      supply: Number.isFinite(minted) ? minted : null,
      supplyMax: Number.isFinite(supply) ? supply : null,
      left: (Number.isFinite(minted) && Number.isFinite(supply)) ? Math.max(supply - minted, 0) : null,
      soldOut: false,
      mints: Number.isFinite(minted) ? minted : null,
      risk: String(verdict.risk || 'unknown').toLowerCase(),
      score: typeof verdict.score === 'number' ? verdict.score : null,
      safety: null,
      findings: null,
      firstSeen: null,
      lastMint: null,
      sources: ['catalog'],
      catalogId: project.id || null
    });
  }
  items.sort((a, b) => (radarRiskRank(a.risk) - radarRiskRank(b.risk)) || ((b.score ?? 0) - (a.score ?? 0)) || String(b.firstSeen || '').localeCompare(String(a.firstSeen || '')));
  return { generatedAt: data.generatedAt || null, items: items.slice(0, 15) };
}

async function fetchDattRadar() {
  const html = await (await fetchWithTimeout(DATT_BASE)).text();
  const items = [];
  for (const match of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = match[1];
    const link = row.match(/<a class="nama-koleksi" href="\/c\/(0x[a-fA-F0-9]{40})\/">([^<]+)<\/a>/);
    if (!link) continue;
    if (!/jenis-mint_percuma/.test(row)) continue;
    const safetyClass = (row.match(/<span class="lencana lencana-([a-z]+)">/) || [])[1] || null;
    const safety = (row.match(/<span class="lencana lencana-[a-z]+">([^<]*)<\/span>/) || [])[1] || null;
    const findings = (row.match(/<span class="temuan">([^<]*)<\/span>/) || [])[1] || null;
    const mints = (row.match(/<td class="nombor">(\d+)<\/td>/) || [])[1];
    items.push({
      contract: link[1].toLowerCase(),
      name: link[2].trim(),
      priceBnb: 0,
      priceSamples: null,
      supply: null,
      supplyMax: null,
      left: null,
      soldOut: false,
      mints: mints ? Number(mints) : null,
      risk: safetyClass === 'hijau' ? 'low' : safetyClass === 'kuning' ? 'medium' : safetyClass === 'merah' ? 'high' : 'unknown',
      safety,
      findings,
      firstSeen: null,
      lastMint: null,
      sources: ['datt']
    });
  }
  return items;
}

async function buildFreemintRadar() {
  const settled = await Promise.allSettled([fetchKoncetRadar(), fetchCatalogRadar(), fetchDattRadar()]);
  const koncet = settled[0].status === 'fulfilled' ? settled[0].value : [];
  const catalog = settled[1].status === 'fulfilled' ? settled[1].value : { generatedAt: null, items: [] };
  const datt = settled[2].status === 'fulfilled' ? settled[2].value : [];
  const sourceStatus = {
    koncet: { ok: settled[0].status === 'fulfilled', count: koncet.length, error: settled[0].status === 'rejected' ? String(settled[0].reason?.message || settled[0].reason) : null },
    catalog: { ok: settled[1].status === 'fulfilled', count: catalog.items.length, generatedAt: catalog.generatedAt, error: settled[1].status === 'rejected' ? String(settled[1].reason?.message || settled[1].reason) : null },
    datt: { ok: settled[2].status === 'fulfilled', count: datt.length, error: settled[2].status === 'rejected' ? String(settled[2].reason?.message || settled[2].reason) : null }
  };

  const byKey = new Map();
  const mergeItem = (item) => {
    const key = item.contract || `name:${normRadarName(item.name)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, sources: [...(item.sources || [])] });
      return;
    }
    existing.sources = [...new Set([...existing.sources, ...(item.sources || [])])];
    if (existing.priceBnb === null || existing.priceBnb === undefined) existing.priceBnb = item.priceBnb;
    if (existing.costText === undefined || existing.costText === null) existing.costText = item.costText;
    if (existing.left === null || existing.left === undefined) existing.left = item.left;
    if (existing.supply === null || existing.supply === undefined) existing.supply = item.supply;
    if (existing.supplyMax === null || existing.supplyMax === undefined) existing.supplyMax = item.supplyMax;
    if (existing.mints === null || existing.mints === undefined) existing.mints = item.mints;
    if (existing.safety === null || existing.safety === undefined) existing.safety = item.safety;
    if (existing.findings === null || existing.findings === undefined) existing.findings = item.findings;
    if (existing.score === null || existing.score === undefined) existing.score = item.score;
    if (existing.catalogId === undefined) existing.catalogId = item.catalogId;
    if (item.soldOut) existing.soldOut = true;
    const risks = [existing.risk, item.risk].map((r) => String(r || 'unknown').toLowerCase());
    existing.risk = risks.includes('high') ? 'high' : risks.includes('medium') ? 'medium' : risks.includes('low') ? 'low' : 'unknown';
    if (item.firstSeen && (!existing.firstSeen || item.firstSeen < existing.firstSeen)) existing.firstSeen = item.firstSeen;
    if (item.lastMint && (!existing.lastMint || item.lastMint > existing.lastMint)) existing.lastMint = item.lastMint;
  };
  for (const item of koncet) mergeItem(item);
  for (const item of datt) mergeItem(item);
  for (const item of catalog.items) mergeItem(item);

  const now = Date.now();
  const results = [...byKey.values()]
    .map((item) => ({
      ...item,
      isNew: item.firstSeen ? (now - new Date(item.firstSeen).getTime() <= 6 * 60 * 60 * 1000) : false,
      links: {
        bscscan: item.contract ? `https://bscscan.com/token/${item.contract}` : null,
        datt: item.contract ? `https://datt.my/c/${item.contract}/` : null
      }
    }))
    .sort((a, b) => String(b.firstSeen || '').localeCompare(String(a.firstSeen || '')))
    .slice(0, 75);

  return {
    generatedAt: new Date().toISOString(),
    catalogGeneratedAt: catalog.generatedAt,
    total: results.length,
    sources: sourceStatus,
    results
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

  if (parsedUrl.pathname === '/api/bnb/agent') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }
    try {
      const agentId = parsedUrl.searchParams.get('agentId');
      const network = parsedUrl.searchParams.get('network') || 'bsc-mainnet';
      if (!agentId || !/^\d+$/.test(agentId)) {
        sendJson(res, 400, { message: 'agentId wajib diisi (angka)' });
        return;
      }
      const result = await fetchBnbAgentById({ network, agentId });
      if (!result.result) {
        sendJson(res, 404, { message: 'Agent tidak ditemukan di indexer' });
        return;
      }
      sendJson(res, 200, { ...result, matched: 1, source: '8004scan indexer' });
    } catch (error) {
      sendJson(res, 500, { message: error.message || 'BNB agent detail failed' });
    }
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

  if (parsedUrl.pathname === '/api/freemint/radar') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }
    try {
      const result = await buildFreemintRadar();
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { message: error.message || 'Freemint radar failed' });
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
      if (parsedUrl.pathname === '/freemint.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, 'freemint.html')));
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
