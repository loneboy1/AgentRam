const API_URL = 'http://localhost:3000/api';
const statusFilters = ['All', 'Active', 'Pending', 'Alert'];
const watchlistStatusFilters = ['All', 'Monitoring', 'Needs Review', 'Verified', 'Deprecated'];
let agents = [];
let watchlist = [];
let selectedStatus = 'All';
let selectedWatchlistStatus = 'All';
let toastTimer;

const $ = (selector) => document.querySelector(selector);

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function validAgent(agent) {
  return agent && typeof agent.id === 'string' && typeof agent.name === 'string' &&
    ['Active', 'Pending', 'Alert'].includes(agent.status) &&
    ['Low', 'Medium', 'High'].includes(agent.risk) &&
    Number.isInteger(Number(agent.trust)) && Number(agent.trust) >= 0 && Number(agent.trust) <= 100;
}

function getAuthHeaders() {
  const token = localStorage.getItem('agentram_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function apiRequest(path, method = 'GET', payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: getAuthHeaders(),
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }

  return data;
}

async function loadMe() {
  try {
    const data = await apiRequest('/me');
    return data;
  } catch (error) {
    logout();
    return null;
  }
}

async function loadAgents() {
  try {
    const data = await apiRequest('/agents');
    if (Array.isArray(data) && data.every(validAgent)) {
      return data;
    }
  } catch (error) {
    console.warn('API load failed:', error.message);
  }

  return [];
}

async function loadWatchlist() {
  try {
    const data = await apiRequest('/watchlist');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Watchlist load failed:', error.message);
    return [];
  }
}

async function refreshWatchlistSources() {
  try {
    const result = await apiRequest('/watchlist/sync');
    showToast(`Sync selesai: ${result.synced}/${result.total} item berhasil diperbarui.`);
    watchlist = await loadWatchlist();
    renderWatchlistTable();
    return result;
  } catch (error) {
    showToast(error.message || 'Gagal sync watchlist.');
    return null;
  }
}

function logout() {
  localStorage.removeItem('agentram_token');
  window.location.reload();
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function statusBadgeClass(status) {
  return status === 'Active' ? 'green' : status === 'Pending' ? 'yellow' : 'red';
}

function riskBadgeClass(risk) {
  return risk === 'Low' ? 'green' : risk === 'Medium' ? 'yellow' : 'red';
}

function watchlistStatusBadgeClass(status) {
  if (status === 'Verified') return 'green';
  if (status === 'Monitoring') return 'blue';
  if (status === 'Needs Review') return 'yellow';
  return 'red';
}

function watchlistRiskBadgeClass(risk) {
  return risk === 'Low' ? 'green' : risk === 'Medium' ? 'yellow' : 'red';
}

function getScoreTone(score = 0) {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'blue';
  return 'red';
}

function renderStats() {
  const stats = [
    { label: 'Total Agent', value: agents.length },
    { label: 'Active', value: agents.filter((agent) => agent.status === 'Active').length },
    { label: 'Pending', value: agents.filter((agent) => agent.status === 'Pending').length },
    { label: 'Alert', value: agents.filter((agent) => agent.status === 'Alert').length }
  ];

  $('#statsGrid').innerHTML = stats.map((stat) => `
    <div class="stat-card">
      <div class="label"><span>${stat.label}</span><span>◈</span></div>
      <div class="value"><strong>${stat.value}</strong><small>agents</small></div>
    </div>
  `).join('');
}

function renderStatusChart() {
  const statusCounts = ['Active', 'Pending', 'Alert'].map((status) => ({
    status,
    count: agents.filter((agent) => agent.status === status).length
  }));

  const max = Math.max(...statusCounts.map((item) => item.count), 1);
  const bars = statusCounts.map(({ status, count }) => `
    <div class="chart-row">
      <div class="chart-label">${status}</div>
      <div class="bar-track">
        <div class="bar-fill ${statusBadgeClass(status)}" style="width: ${(count / max) * 100}%"></div>
      </div>
      <div class="chart-value">${count}</div>
    </div>
  `).join('');

  $('#statusChart').innerHTML = bars;
}

function renderTrustChart() {
  const total = agents.length || 1;
  const averageTrust = Math.round(
    agents.reduce((sum, agent) => sum + Number(agent.trust || 0), 0) / total
  );

  $('#trustChart').innerHTML = `
    <div class="ring-wrap">
      <div class="ring" style="--progress:${averageTrust}; --ring-color:${averageTrust >= 80 ? '#22c55e' : averageTrust >= 60 ? '#fbbf24' : '#f87171'};">
        <div class="ring-center"><strong>${averageTrust}%</strong></div>
      </div>
    </div>
  `;
}

function renderFilters() {
  const container = $('#statusFilters');
  container.innerHTML = statusFilters.map((status) => `
    <button class="filter-chip ${selectedStatus === status ? 'active' : ''}" type="button" data-status="${status}">${status}</button>
  `).join('');

  container.querySelectorAll('.filter-chip').forEach((button) => {
    button.addEventListener('click', () => {
      selectedStatus = button.dataset.status;
      renderFilters();
      renderTable();
    });
  });
}

function renderTable() {
  const searchValue = $('#searchInput').value.trim().toLowerCase();
  const filteredAgents = agents.filter((agent) => {
    const matchesStatus = selectedStatus === 'All' || agent.status === selectedStatus;
    const searchable = [agent.id, agent.name, agent.wallet, agent.notes, agent.status, agent.risk].join(' ').toLowerCase();
    return matchesStatus && (!searchValue || searchable.includes(searchValue));
  });

  $('#resultCount').textContent = `${filteredAgents.length} hasil`;
  const body = $('#agentTableBody');

  if (!filteredAgents.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-row">Tidak ada agent yang cocok.</td></tr>';
    return;
  }

  body.innerHTML = filteredAgents.map((agent) => `
    <tr>
      <td><strong>${escapeHTML(agent.id)}</strong></td>
      <td>${escapeHTML(agent.name)}</td>
      <td>${escapeHTML(agent.wallet || '—')}</td>
      <td><span class="badge ${statusBadgeClass(agent.status)}"><span class="status-dot"></span>${escapeHTML(agent.status)}</span></td>
      <td><span class="badge ${riskBadgeClass(agent.risk)}">${escapeHTML(agent.risk)}</span></td>
      <td><span class="badge ${Number(agent.trust) >= 85 ? 'green' : Number(agent.trust) >= 70 ? 'yellow' : 'blue'}">${Number(agent.trust)}%</span></td>
      <td>${escapeHTML(agent.lastSync || '—')}</td>
      <td>${escapeHTML(agent.notes || '—')}</td>
      <td class="row-actions">
        <button class="action-btn" type="button" data-action="view" data-id="${escapeHTML(agent.id)}">View</button>
        <button class="action-btn" type="button" data-action="edit" data-id="${escapeHTML(agent.id)}">Edit</button>
        <button class="action-btn danger-btn" type="button" data-action="delete" data-id="${escapeHTML(agent.id)}">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function renderWatchlistTable() {
  const panel = $('#watchlistPanel');
  if (!panel) return;

  const searchInput = $('#watchlistSearch');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const filtered = watchlist.filter((item) => {
    const matchesStatus = selectedWatchlistStatus === 'All' || item.status === selectedWatchlistStatus;
    const haystack = [
      item.name,
      item.agentId,
      item.category,
      item.platform,
      item.sourceType,
      item.sourceUrl,
      item.tags ? item.tags.join(' ') : '',
      item.notes,
      (item.sourceMeta && (item.sourceMeta.title || item.sourceMeta.description)) || ''
    ].join(' ').toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });

  const countEl = $('#watchlistCount');
  if (countEl) countEl.textContent = `${filtered.length} items`;

  const body = $('#watchlistTableBody');
  if (!body) return;

  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty-row">Tidak ada proyek yang cocok.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item) => {
    const score = Number(item.score || 0);
    const scoreTone = getScoreTone(score);
    const alertLabel = score >= 80 ? 'Strong signal' : score >= 60 ? 'Watching' : score >= 40 ? 'Review' : 'Low';

    return `
      <tr>
        <td><strong>${escapeHTML(item.name || 'Unnamed')}</strong></td>
        <td>${escapeHTML(item.agentId || '—')}</td>
        <td><span class="badge ${watchlistStatusBadgeClass(item.status || 'Monitoring')}">${escapeHTML(item.status || 'Monitoring')}</span></td>
        <td>${escapeHTML(item.category || 'General')}</td>
        <td>${escapeHTML(item.platform || '—')}</td>
        <td><a href="${escapeHTML(item.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.sourceType || 'web')}</a></td>
        <td><span class="badge ${watchlistRiskBadgeClass(item.risk || 'Medium')}">${escapeHTML(item.risk || 'Medium')}</span></td>
        <td>${escapeHTML(item.lastSeen || 'Recently')}</td>
        <td>${escapeHTML((item.tags || []).join(', ') || '—')}</td>
        <td>
          <div class="score-pill ${scoreTone}">${score}</div>
          <div class="muted-mini">${alertLabel}</div>
        </td>
        <td class="row-actions">
          <button class="action-btn" type="button" data-watchlist-action="view" data-id="${escapeHTML(item.id)}">View</button>
          <button class="action-btn" type="button" data-watchlist-action="edit" data-id="${escapeHTML(item.id)}">Edit</button>
          <button class="action-btn danger-btn" type="button" data-watchlist-action="delete" data-id="${escapeHTML(item.id)}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function refreshDashboard() {
  renderStats();
  renderStatusChart();
  renderTrustChart();
  renderFilters();
  renderTable();
  renderWatchlistTable();
}

function openDialog(agent) {
  const form = $('#agentForm');
  form.reset();
  $('#originalId').value = agent?.id || '';
  $('#dialogTitle').textContent = agent ? 'Edit Agent' : 'Tambah Agent';
  $('#agentId').value = agent?.id || '';
  $('#agentId').readOnly = Boolean(agent);
  $('#agentName').value = agent?.name || '';
  $('#agentWallet').value = agent?.wallet || '';
  $('#agentStatus').value = agent?.status || 'Active';
  $('#agentRisk').value = agent?.risk || 'Low';
  $('#agentTrust').value = agent?.trust ?? 80;
  $('#agentLastSync').value = agent?.lastSync || '';
  $('#agentNotes').value = agent?.notes || '';
  $('#agentDialog').showModal();
  $('#agentId').focus();
}

function openDetailModal(agent) {
  $('#detailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span>Agent ID</span>
        <strong>${escapeHTML(agent.id)}</strong>
      </div>
      <div class="detail-item">
        <span>Nama</span>
        <strong>${escapeHTML(agent.name)}</strong>
      </div>
      <div class="detail-item">
        <span>Wallet</span>
        <strong>${escapeHTML(agent.wallet || '—')}</strong>
      </div>
      <div class="detail-item">
        <span>Status</span>
        <strong><span class="badge ${statusBadgeClass(agent.status)}"><span class="status-dot"></span>${escapeHTML(agent.status)}</span></strong>
      </div>
      <div class="detail-item">
        <span>Risk</span>
        <strong><span class="badge ${riskBadgeClass(agent.risk)}">${escapeHTML(agent.risk)}</span></strong>
      </div>
      <div class="detail-item">
        <span>Trust</span>
        <strong>${Number(agent.trust)}%</strong>
      </div>
      <div class="detail-item">
        <span>Last Sync</span>
        <strong>${escapeHTML(agent.lastSync || '—')}</strong>
      </div>
      <div class="detail-item wide-item">
        <span>Notes</span>
        <strong>${escapeHTML(agent.notes || '—')}</strong>
      </div>
    </div>
  `;
  $('#agentDetailDialog').showModal();
}

function openWatchlistDetailModal(item) {
  const content = $( '#watchlistDetailContent' );
  if (!content) return;

  const sourceMeta = item.sourceMeta || {};
  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span>Project</span>
        <strong>${escapeHTML(item.name || '—')}</strong>
      </div>
      <div class="detail-item">
        <span>Agent ID</span>
        <strong>${escapeHTML(item.agentId || '—')}</strong>
      </div>
      <div class="detail-item">
        <span>Category</span>
        <strong>${escapeHTML(item.category || 'General')}</strong>
      </div>
      <div class="detail-item">
        <span>Platform</span>
        <strong>${escapeHTML(item.platform || '—')}</strong>
      </div>
      <div class="detail-item">
        <span>Status</span>
        <strong><span class="badge ${watchlistStatusBadgeClass(item.status || 'Monitoring')}">${escapeHTML(item.status || 'Monitoring')}</span></strong>
      </div>
      <div class="detail-item">
        <span>Risk</span>
        <strong><span class="badge ${watchlistRiskBadgeClass(item.risk || 'Medium')}">${escapeHTML(item.risk || 'Medium')}</span></strong>
      </div>
      <div class="detail-item">
        <span>Score</span>
        <strong>${Number(item.score || 0)}</strong>
      </div>
      <div class="detail-item">
        <span>Last Seen</span>
        <strong>${escapeHTML(item.lastSeen || 'Recently')}</strong>
      </div>
      <div class="detail-item wide-item">
        <span>Source</span>
        <strong><a href="${escapeHTML(item.sourceUrl || '#')}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.sourceUrl || '—')}</a></strong>
      </div>
      <div class="detail-item wide-item">
        <span>Source Summary</span>
        <strong>${escapeHTML(sourceMeta.title || item.name || '—')}<br>${escapeHTML(sourceMeta.description || item.notes || '—')}</strong>
      </div>
      <div class="detail-item wide-item">
        <span>Notes</span>
        <strong>${escapeHTML(item.notes || '—')}</strong>
      </div>
      <div class="detail-item wide-item">
        <span>Tags</span>
        <strong>${escapeHTML((item.tags || []).join(', ') || '—')}</strong>
      </div>
    </div>
  `;

  const dialog = $('#watchlistDetailDialog');
  if (dialog) dialog.showModal();
}

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const originalId = $('#originalId').value;
  const id = formData.get('id').trim();
  const duplicate = agents.some((agent) => agent.id.toLowerCase() === id.toLowerCase() && agent.id !== originalId);

  if (duplicate) {
    $('#agentId').setCustomValidity('Agent ID sudah digunakan.');
    $('#agentId').reportValidity();
    $('#agentId').setCustomValidity('');
    return;
  }

  const agent = {
    id,
    name: formData.get('name').trim(),
    wallet: formData.get('wallet').trim(),
    status: formData.get('status'),
    risk: formData.get('risk'),
    trust: Number(formData.get('trust')),
    lastSync: formData.get('lastSync').trim() || 'Baru saja',
    notes: formData.get('notes').trim()
  };

  try {
    if (originalId) {
      await apiRequest('/agents', 'PUT', agent);
      showToast('Data agent berhasil diperbarui.');
    } else {
      await apiRequest('/agents', 'POST', agent);
      showToast('Agent berhasil ditambahkan.');
    }

    agents = await loadAgents();
    refreshDashboard();
    $('#agentDialog').close();
  } catch (error) {
    showToast(error.message || 'Gagal menyimpan agent.');
  }
}

async function handleTableAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const agent = agents.find((item) => item.id === button.dataset.id);
  if (!agent) return;

  if (button.dataset.action === 'view') {
    openDetailModal(agent);
  } else if (button.dataset.action === 'edit') {
    openDialog(agent);
  } else if (button.dataset.action === 'delete' && confirm(`Hapus agent ${agent.id}?`)) {
    try {
      await apiRequest(`/agents?id=${encodeURIComponent(agent.id)}`, 'DELETE');
      agents = await loadAgents();
      refreshDashboard();
      showToast('Agent berhasil dihapus.');
    } catch (error) {
      showToast(error.message || 'Gagal menghapus agent.');
    }
  }
}

function ensureWatchlistPanel() {
  if ($('#watchlistPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'watchlistPanel';
  panel.className = 'wide-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Intelligence</p>
        <h3>Project Watchlist</h3>
      </div>
      <div class="topbar-actions">
        <button class="secondary-btn" type="button" id="watchlistSyncButton">Sync Sources</button>
        <button class="primary-btn" type="button" id="watchlistAddButton">Add Project</button>
      </div>
    </div>
    <div class="panel-header" style="margin-top: 12px; margin-bottom: 14px;">
      <div class="search-box">
        <input id="watchlistSearch" type="text" placeholder="Search project / agent / source" />
      </div>
      <div class="filter-row" id="watchlistFilters"></div>
    </div>
    <div class="result-badge" id="watchlistCount">0 items</div>
    <div class="table-scroll" style="margin-top: 14px;">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Agent ID</th>
            <th>Status</th>
            <th>Category</th>
            <th>Platform</th>
            <th>Source</th>
            <th>Risk</th>
            <th>Last Seen</th>
            <th>Tags</th>
            <th>Score</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="watchlistTableBody"></tbody>
      </table>
    </div>
  `;

  const target = $('#statsGrid');
  if (target && target.parentNode) {
    target.parentNode.insertBefore(panel, target.nextSibling);
  }

  renderWatchlistFilters();
  $('#watchlistSearch').addEventListener('input', renderWatchlistTable);
  $('#watchlistAddButton').addEventListener('click', () => openWatchlistModal());
  $('#watchlistSyncButton').addEventListener('click', refreshWatchlistSources);
}

function renderWatchlistFilters() {
  const filters = $('#watchlistFilters');
  if (!filters) return;

  filters.innerHTML = watchlistStatusFilters.map((status) => `
    <button class="filter-chip ${selectedWatchlistStatus === status ? 'active' : ''}" type="button" data-watchlist-status="${status}">${status}</button>
  `).join('');

  filters.querySelectorAll('[data-watchlist-status]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedWatchlistStatus = button.dataset.watchlistStatus;
      renderWatchlistFilters();
      renderWatchlistTable();
    });
  });
}

function openWatchlistModal(item = null) {
  let dialog = $('#watchlistDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'watchlistDialog';
    dialog.className = 'agent-dialog';
    dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="watchlistDialogTitle">Add Project</h2>
        <button type="button" class="icon-btn" id="watchlistDialogClose">×</button>
      </div>
      <form id="watchlistForm">
        <div class="form-grid">
          <input type="hidden" id="watchlistId" />
          <label>
            Project Name
            <input id="watchlistName" name="name" required />
          </label>
          <label>
            Agent ID
            <input id="watchlistAgentId" name="agentId" required />
          </label>
          <label>
            Category
            <select id="watchlistCategory" name="category">
              <option value="Launch">Launch</option>
              <option value="Campaign">Campaign</option>
              <option value="Freemint">Freemint</option>
              <option value="Reward">Reward</option>
              <option value="Claim">Claim</option>
              <option value="Partner">Partner</option>
              <option value="General">General</option>
            </select>
          </label>
          <label>
            Platform
            <select id="watchlistPlatform" name="platform">
              <option value="BNB">BNB</option>
              <option value="Ethereum">Ethereum</option>
              <option value="Solana">Solana</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>
            Source Type
            <select id="watchlistSourceType" name="sourceType">
              <option value="website">Website</option>
              <option value="x">X</option>
              <option value="docs">Docs</option>
              <option value="blog">Blog</option>
              <option value="forum">Forum</option>
              <option value="registry">Registry</option>
              <option value="contract">Contract</option>
            </select>
          </label>
          <label>
            Source URL
            <input id="watchlistSourceUrl" name="sourceUrl" type="url" placeholder="https://" />
          </label>
          <label>
            Status
            <select id="watchlistStatus" name="status">
              <option value="Monitoring">Monitoring</option>
              <option value="Needs Review">Needs Review</option>
              <option value="Verified">Verified</option>
              <option value="Deprecated">Deprecated</option>
            </select>
          </label>
          <label>
            Risk
            <select id="watchlistRisk" name="risk">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>
          <label class="full-width-form">
            Tags
            <input id="watchlistTags" name="tags" placeholder="launch, ai, reward" />
          </label>
          <label class="full-width-form">
            Notes
            <textarea id="watchlistNotes" name="notes" rows="4"></textarea>
          </label>
        </div>
        <div class="dialog-actions">
          <button type="button" class="secondary-btn" id="watchlistCancelButton">Cancel</button>
          <button type="submit" class="primary-btn">Save Project</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    $('#watchlistDialogClose').addEventListener('click', () => dialog.close());
    $('#watchlistCancelButton').addEventListener('click', () => dialog.close());
    $('#watchlistForm').addEventListener('submit', handleWatchlistSubmit);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  $('#watchlistDialogTitle').textContent = item ? 'Edit Project' : 'Add Project';
  $('#watchlistId').value = item?.id || '';
  $('#watchlistName').value = item?.name || '';
  $('#watchlistAgentId').value = item?.agentId || '';
  $('#watchlistCategory').value = item?.category || 'General';
  $('#watchlistPlatform').value = item?.platform || 'BNB';
  $('#watchlistSourceType').value = item?.sourceType || 'website';
  $('#watchlistSourceUrl').value = item?.sourceUrl || '';
  $('#watchlistStatus').value = item?.status || 'Monitoring';
  $('#watchlistRisk').value = item?.risk || 'Medium';
  $('#watchlistTags').value = Array.isArray(item?.tags) ? item.tags.join(', ') : '';
  $('#watchlistNotes').value = item?.notes || '';
  dialog.showModal();
}

async function handleWatchlistSubmit(event) {
  event.preventDefault();
  const payload = {
    id: $('#watchlistId').value || `watch-${Date.now()}`,
    name: $('#watchlistName').value.trim(),
    agentId: $('#watchlistAgentId').value.trim(),
    category: $('#watchlistCategory').value,
    platform: $('#watchlistPlatform').value,
    sourceType: $('#watchlistSourceType').value,
    sourceUrl: $('#watchlistSourceUrl').value.trim(),
    status: $('#watchlistStatus').value,
    risk: $('#watchlistRisk').value,
    tags: $('#watchlistTags').value.split(',').map((value) => value.trim()).filter(Boolean),
    notes: $('#watchlistNotes').value.trim(),
    lastSeen: 'Recently'
  };

  if (!payload.name || !payload.agentId) {
    showToast('Project name dan Agent ID wajib diisi.');
    return;
  }

  try {
    const existingId = $('#watchlistId').value;
    if (existingId) {
      await apiRequest('/watchlist', 'PUT', payload);
      showToast('Project watchlist berhasil diperbarui.');
    } else {
      await apiRequest('/watchlist', 'POST', payload);
      showToast('Project watchlist berhasil ditambahkan.');
    }

    watchlist = await loadWatchlist();
    renderWatchlistTable();
    $('#watchlistDialog').close();
  } catch (error) {
    showToast(error.message || 'Gagal menyimpan watchlist.');
  }
}

async function handleWatchlistTableAction(event) {
  const button = event.target.closest('[data-watchlist-action]');
  if (!button) return;

  const id = button.dataset.id;
  const item = watchlist.find((entry) => entry.id === id);
  if (!item) return;

  if (button.dataset.watchlistAction === 'view') {
    openWatchlistDetailModal(item);
    return;
  }

  if (button.dataset.watchlistAction === 'edit') {
    openWatchlistModal(item);
    return;
  }

  if (button.dataset.watchlistAction === 'delete' && confirm(`Hapus proyek ${item.name}?`)) {
    try {
      await apiRequest(`/watchlist?id=${encodeURIComponent(id)}`, 'DELETE');
      watchlist = await loadWatchlist();
      renderWatchlistTable();
      showToast('Project watchlist berhasil dihapus.');
    } catch (error) {
      showToast(error.message || 'Gagal menghapus watchlist.');
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = $('#loginUsername').value.trim();
  const password = $('#loginPassword').value;
  const submitButton = $('#loginSubmit');

  submitButton.disabled = true;
  submitButton.textContent = 'Masuk...';

  try {
    const data = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(async (response) => {
      const text = await response.text();
      const json = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(json?.message || 'Login gagal');
      return json;
    });

    localStorage.setItem('agentram_token', data.token);
    $('#loginForm').reset();
    initDashboard();
  } catch (error) {
    $('#loginError').textContent = error.message || 'Login gagal';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Masuk';
  }
}

function renderLogin() {
  $('#app').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
}

function renderDashboard() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

function ensureBnbLookupPanel() {
  const mount = $('#bnbLookupMount');
  if (mount) return;

  const container = document.createElement('div');
  container.id = 'bnbLookupMount';
  container.className = 'wide-panel';
  container.innerHTML = `
    <div class="panel-header">
      <h3>BNB Agent / Freemint Lookup</h3>
      <span class="result-badge">ERC-8004 registry</span>
    </div>
    <div class="form-grid">
      <label>
        Agent ID
        <input id="bnbAgentId" type="text" placeholder="contoh: 123" />
      </label>
      <label>
        Wallet Address
        <input id="bnbWallet" type="text" placeholder="0x..." />
      </label>
      <label class="full-width-form">
        Agent Name
        <input id="bnbName" type="text" placeholder="contoh: my-agent" />
      </label>
      <label>
        Network
        <select id="bnbNetwork">
          <option value="bsc-mainnet">BSC Mainnet</option>
          <option value="bsc-testnet">BSC Testnet</option>
        </select>
      </label>
      <div class="dialog-actions">
        <button class="secondary-btn" type="button" id="bnbClearButton">Reset</button>
        <button class="primary-btn" type="button" id="bnbSearchButton">Cari</button>
      </div>
    </div>
    <div id="bnbLookupResult" class="detail-content" style="margin-top: 18px; min-height: 100px;">
      <div class="result-badge">Belum ada pencarian.</div>
    </div>
  `;

  const target = $('#statsGrid');
  if (target && target.parentNode) {
    target.parentNode.insertBefore(container, target.nextSibling);
  } else {
    const app = $('#app');
    if (app) app.appendChild(container);
  }

  $('#bnbClearButton').addEventListener('click', () => {
    $('#bnbAgentId').value = '';
    $('#bnbWallet').value = '';
    $('#bnbName').value = '';
    $('#bnbNetwork').value = 'bsc-mainnet';
    $('#bnbLookupResult').innerHTML = '<div class="result-badge">Belum ada pencarian.</div>';
  });

  $('#bnbSearchButton').addEventListener('click', runBnbLookup);
}

async function runBnbLookup() {
  const resultBox = $('#bnbLookupResult');
  if (!resultBox) return;

  const params = {
    agentId: $('#bnbAgentId').value.trim() || undefined,
    wallet: $('#bnbWallet').value.trim() || undefined,
    name: $('#bnbName').value.trim() || undefined,
    network: $('#bnbNetwork').value || 'bsc-mainnet'
  };

  if (!params.agentId && !params.wallet && !params.name) {
    resultBox.innerHTML = '<div class="result-badge">Isi minimal satu filter: Agent ID, wallet, atau name.</div>';
    return;
  }

  resultBox.innerHTML = '<div class="result-badge">Mencari data BNB Agent...</div>';

  try {
    const fallback = await fetch(`${API_URL}/bnb/lookup?${new URLSearchParams({
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.wallet ? { wallet: params.wallet } : {}),
      ...(params.name ? { name: params.name } : {}),
      network: params.network
    })}`, {
      headers: getAuthHeaders()
    });

    const json = await fallback.json();
    if (!fallback.ok) throw new Error(json?.message || 'BNB lookup gagal');

    const rows = (json.results || []).map((item) => `
      <div class="detail-item wide-item">
        <span>Agent ${item.agentId ?? '—'}</span>
        <strong>${escapeHTML(item.name || 'Unnamed')} • ${escapeHTML(item.ownerAddress || '—')} • ${item.freemintCandidate ? 'Freemint candidate' : 'Regular agent'}</strong>
      </div>
    `).join('');

    resultBox.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <span>Network</span>
          <strong>${escapeHTML(json.network)}</strong>
        </div>
        <div class="detail-item">
          <span>Registry</span>
          <strong>${escapeHTML(json.registryContract || '—')}</strong>
        </div>
        <div class="detail-item">
          <span>Matched</span>
          <strong>${json.matched ?? 0}</strong>
        </div>
        <div class="detail-item">
          <span>Source</span>
          <strong>${escapeHTML(json.source || '—')}</strong>
        </div>
        ${rows || '<div class="detail-item wide-item"><span>Hasil</span><strong>Tidak ada agent yang cocok.</strong></div>'}
      </div>
    `;
  } catch (error) {
    resultBox.innerHTML = `<div class="result-badge">${escapeHTML(error.message || 'Gagal mencari data BNB Agent.')}</div>`;
  }
}

function ensureWatchlistDetailDialog() {
  if ($('#watchlistDetailDialog')) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'watchlistDetailDialog';
  dialog.className = 'detail-dialog';
  dialog.innerHTML = `
    <div class="dialog-header">
      <div>
        <p class="eyebrow">Project Detail</p>
        <h2 id="watchlistDetailTitle">Project Summary</h2>
      </div>
      <button class="icon-btn" type="button" id="watchlistDetailCloseButton" aria-label="Tutup detail">×</button>
    </div>
    <div id="watchlistDetailContent" class="detail-content"></div>
    <div class="dialog-actions">
      <button class="primary-btn" type="button" id="watchlistDetailCloseFooterButton">Tutup</button>
    </div>
  `;

  document.body.appendChild(dialog);
  $('#watchlistDetailCloseButton').addEventListener('click', () => dialog.close());
  $('#watchlistDetailCloseFooterButton').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

async function initDashboard() {
  const user = await loadMe();
  if (!user) {
    renderLogin();
    return;
  }

  renderDashboard();
  $('#usernameLabel').textContent = user.username;
  agents = await loadAgents();
  watchlist = await loadWatchlist();
  refreshDashboard();
  ensureBnbLookupPanel();
  ensureWatchlistPanel();
  ensureWatchlistDetailDialog();
  renderWatchlistTable();
}

async function init() {
  const token = localStorage.getItem('agentram_token');
  if (!token) {
    renderLogin();
  } else {
    await initDashboard();
  }

  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutButton').addEventListener('click', logout);
  $('#searchInput').addEventListener('input', renderTable);
  $('#addAgentButton').addEventListener('click', () => openDialog());
  $('#exportButton').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(agents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agents.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Data agent diekspor.');
  });
  $('#agentForm').addEventListener('submit', handleSubmit);
  $('#agentTableBody').addEventListener('click', handleTableAction);
  $('#watchlistTableBody').addEventListener('click', handleWatchlistTableAction);
  $('#closeDialogButton').addEventListener('click', () => $('#agentDialog').close());
  $('#cancelDialogButton').addEventListener('click', () => $('#agentDialog').close());
  $('#closeDetailDialogButton').addEventListener('click', () => $('#agentDetailDialog').close());
  $('#detailCloseButton').addEventListener('click', () => $('#agentDetailDialog').close());
  $('#agentDialog').addEventListener('click', (event) => {
    if (event.target === $('#agentDialog')) $('#agentDialog').close();
  });
  $('#agentDetailDialog').addEventListener('click', (event) => {
    if (event.target === $('#agentDetailDialog')) $('#agentDetailDialog').close();
  });
}

init();
