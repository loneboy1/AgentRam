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

    if (!response.ok) {
      return null;
    }

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

async function syncWatchlistSources() {
  const list = readWatchlist().map(normalizeWatchlistItem);
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
      updatedAt: new Date().toISOString()
    };

    const index = list.findIndex((entry) => entry.id === item.id);
    if (index !== -1) {
      list[index] = updatedItem;
    }

    syncResults.push({ id: item.id, ok: true, title: summary.title || item.name });
  }

  writeWatchlist(list);
  return {
    synced: syncResults.filter((item) => item.ok).length,
    total: list.length,
    items: syncResults
  };
}

function readWatchlist() {
  return readJson(WATCHLIST_FILE).map(normalizeWatchlistItem);
}

function writeWatchlist(data) {
  writeJson(WATCHLIST_FILE, data.map(normalizeWatchlistItem));
}

async function fetchBnbAgents(networkName = 'bsc-mainnet') {
