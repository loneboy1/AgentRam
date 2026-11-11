const API_URL = 'http://localhost:3000/api';
const statusFilters = ['All', 'Active', 'Pending', 'Alert'];
const bnbFilters = [
  { value: 'all', label: 'Semua' },
  { value: 'freemint', label: 'Freemint only' },
  { value: 'regular', label: 'Regular only' }
];

let agents = [];
let selectedStatus = 'All';
let selectedBnbFilter = 'all';
let toastTimer;

const $ = (selector) => document.querySelector(selector);

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function validAgent(agent) {
  return agent &&
    typeof agent.id === 'string' &&
    typeof agent.name === 'string' &&
    ['Active', 'Pending', 'Alert'].includes(agent.status) &&
    ['Low', 'Medium', 'High'].includes(agent.risk) &&
    Number.isInteger(Number(agent.trust)) &&
    Number(agent.trust) >= 0 &&
    Number(agent.trust) <= 100;
}

function parseNaturalQuery(query = '') {
  const text = String(query || '').trim().toLowerCase();
  if (!text) {
    return { status: null, risk: null, minTrust: null, wallet: null, keywords: [] };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  const status = ['active', 'pending', 'alert'].find((value) => tokens.includes(value)) || null;
  const risk = ['low', 'medium', 'high'].find((value) => tokens.includes(value)) || null;
  const wallet = tokens.find((token) => token.startsWith('0x')) || null;
  const minTrustTerm = tokens.find((token) => /^\d+%?$/.test(token));
  const minTrust = minTrustTerm ? Number(minTrustTerm.replace('%', '')) : null;

  return {
    status,
    risk,
    wallet,
    minTrust,
    keywords: tokens.filter((token) => !['active', 'pending', 'alert', 'low', 'medium', 'high', 'trust', 'wallet', 'bnb', 'agent', 'find', 'search', 'show', 'list'].includes(token))
  };
}

function smartFilterAgents(list, query = '') {
  const filters = parseNaturalQuery(query);
  const cleaned = String(query || '').trim();

  if (!cleaned) {
    return list;
  }

  return list.filter((agent) => {
    const haystack = [agent.id, agent.name, agent.wallet, agent.status, agent.risk, agent.notes].join(' ').toLowerCase();
    const keywordMatch = !filters.keywords.length || filters.keywords.some((keyword) => haystack.includes(keyword));
    const statusMatch = !filters.status || agent.status.toLowerCase() === filters.status;
    const riskMatch = !filters.risk || agent.risk.toLowerCase() === filters.risk;
    const walletMatch = !filters.wallet || (agent.wallet || '').toLowerCase().includes(filters.wallet);
    const trustMatch = filters.minTrust === null || Number(agent.trust) >= Number(filters.minTrust);
    const textMatch = !cleaned || haystack.includes(cleaned) || agent.id.toLowerCase().includes(cleaned) || agent.name.toLowerCase().includes(cleaned);
    return keywordMatch && statusMatch && riskMatch && walletMatch && trustMatch && textMatch;
  });
}

function getAuthHeaders() {
  const token = localStorage.getItem('agentram_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function apiRequest(path, method = 'GET', payload) {
  const requestOptions = {
    method,
    headers: getAuthHeaders()
  };

  if (payload !== undefined && !['GET', 'DELETE'].includes(method)) {
    requestOptions.body = JSON.stringify(payload);
  }

  const response = await fetch(`${API_URL}${path}`, requestOptions);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }

  return data;
}

async function loadMe() {
  try {
    return await apiRequest('/me');
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
  const searchValue = $('#searchInput').value.trim();
  const filteredAgents = smartFilterAgents(
    agents
      .filter((agent) => selectedStatus === 'All' || agent.status === selectedStatus)
      .sort((a, b) => Number(b.trust) - Number(a.trust)),
    searchValue
  );

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

function refreshDashboard() {
  renderStats();
  renderStatusChart();
  renderTrustChart();
  renderFilters();
  renderTable();
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

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const originalId = $('#originalId').value;
  const id = String(formData.get('id') || '').trim();

  if (!id) {
    $('#agentId').setCustomValidity('Agent ID wajib diisi.');
    $('#agentId').reportValidity();
    $('#agentId').setCustomValidity('');
    return;
  }

  const duplicate = agents.some((agent) => agent.id.toLowerCase() === id.toLowerCase() && agent.id !== originalId);

  if (duplicate) {
    $('#agentId').setCustomValidity('Agent ID sudah digunakan.');
    $('#agentId').reportValidity();
    $('#agentId').setCustomValidity('');
    return;
  }

  const agent = {
    id,
    name: String(formData.get('name') || '').trim(),
    wallet: String(formData.get('wallet') || '').trim(),
    status: String(formData.get('status') || 'Active'),
    risk: String(formData.get('risk') || 'Low'),
    trust: Number(formData.get('trust')),
    lastSync: String(formData.get('lastSync') || '').trim() || 'Baru saja',
    notes: String(formData.get('notes') || '').trim()
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
  const existingRoot = $('#bnbLookupMount');
  if (existingRoot) return;

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
      <label>
        Filter
        <select id="bnbFilterScope">
          ${bnbFilters.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}
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
    $('#app').appendChild(container);
  }

  $('#bnbClearButton').addEventListener('click', () => {
    $('#bnbAgentId').value = '';
    $('#bnbWallet').value = '';
    $('#bnbName').value = '';
    $('#bnbNetwork').value = 'bsc-mainnet';
    $('#bnbFilterScope').value = 'all';
    selectedBnbFilter = 'all';
    $('#bnbLookupResult').innerHTML = '<div class="result-badge">Belum ada pencarian.</div>';
  });

  $('#bnbFilterScope').addEventListener('change', (event) => {
    selectedBnbFilter = event.target.value;
    if ($('#bnbLookupResult').textContent.trim() && !$('#bnbLookupResult').textContent.includes('Belum ada pencarian')) {
      runBnbLookup();
    }
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

  if (params.agentId && (!Number.isInteger(Number(params.agentId)) || Number(params.agentId) < 0)) {
    resultBox.innerHTML = '<div class="result-badge">Agent ID harus berupa angka bulat yang valid.</div>';
    return;
  }

  if (params.wallet && !/^0x[0-9a-fA-F]+$/.test(params.wallet)) {
    resultBox.innerHTML = '<div class="result-badge">Wallet harus berupa alamat 0x yang valid.</div>';
    return;
  }

  resultBox.innerHTML = '<div class="result-badge">Mencari data BNB Agent...</div>';

  try {
    const query = new URLSearchParams({
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.wallet ? { wallet: params.wallet } : {}),
      ...(params.name ? { name: params.name } : {}),
      network: params.network
    });

    const response = await fetch(`${API_URL}/bnb/lookup?${query.toString()}`, {
      headers: getAuthHeaders()
    });

    const json = await response.json();
    if (!response.ok) throw new Error(json?.message || 'BNB lookup gagal');

    const allResults = Array.isArray(json.results) ? json.results : [];
    const filteredResults = selectedBnbFilter === 'freemint'
      ? allResults.filter((item) => item.freemintCandidate)
      : selectedBnbFilter === 'regular'
        ? allResults.filter((item) => !item.freemintCandidate)
        : allResults;

    const rows = filteredResults.map((item) => `
      <div class="detail-item wide-item">
        <span>Agent ${item.agentId ?? '—'}</span>
        <strong>${escapeHTML(item.name || 'Unnamed')} • ${escapeHTML(item.ownerAddress || '—')} • ${item.freemintCandidate ? 'Freemint candidate' : 'Regular agent'}</strong>
      </div>
    `).join('');

    resultBox.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <span>Network</span>
          <strong>${escapeHTML(json.network || params.network)}</strong>
        </div>
        <div class="detail-item">
          <span>Registry</span>
          <strong>${escapeHTML(json.registryContract || '—')}</strong>
        </div>
        <div class="detail-item">
          <span>Matched</span>
          <strong>${filteredResults.length ?? 0}</strong>
        </div>
        <div class="detail-item">
          <span>Source</span>
          <strong>${escapeHTML(json.source || '—')}</strong>
        </div>
        ${rows || '<div class="detail-item wide-item"><span>Hasil</span><strong>Tidak ada agent yang cocok dengan filter saat ini.</strong></div>'}
      </div>
    `;
  } catch (error) {
    resultBox.innerHTML = `<div class="result-badge">${escapeHTML(error.message || 'Gagal mencari data BNB Agent.')}</div>`;
  }
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
  refreshDashboard();
  ensureBnbLookupPanel();
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































































































n




















































































































































































































































































"}]}  