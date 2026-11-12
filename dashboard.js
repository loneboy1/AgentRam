const WATCHLIST_KEY = 'agentram-watchlist-v1';
const statusFilters = ['All', 'Active', 'Pending', 'Alert'];
let agents = loadWatchlist();
let selectedStatus = 'All';
let selectedAgentIds = new Set();
let toastTimer;
let confirmResolve = null;

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

// Daftar pantauan disimpan di browser masing-masing (localStorage):
// tiap orang yang buka web ini lihat daftarnya sendiri-sendiri.
function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data.filter(validAgent);
  } catch (error) {
    console.warn('Watchlist load failed:', error.message);
  }
  return [];
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(agents));
  } catch (error) {
    console.warn('Watchlist save failed:', error.message);
  }
}

function shortWallet(wallet = '') {
  const value = String(wallet || '');
  if (!value || value === '—') return '—';
  if (value.length <= 13) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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
    const walletMatch = !filters.wallet || agent.wallet.toLowerCase().includes(filters.wallet);
    const trustMatch = filters.minTrust === null || Number(agent.trust) >= Number(filters.minTrust);
    const textMatch = !cleaned || haystack.includes(cleaned) || agent.id.toLowerCase().includes(cleaned) || agent.name.toLowerCase().includes(cleaned);
    return keywordMatch && statusMatch && riskMatch && walletMatch && trustMatch && textMatch;
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || 'Request failed');
  }
  return data;
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
    agents.filter((agent) => selectedStatus === 'All' || agent.status === selectedStatus),
    searchValue
  );

  $('#resultCount').textContent = `${filteredAgents.length} hasil`;
  const body = $('#agentTableBody');

  if (!filteredAgents.length) {
    const emptyMessage = agents.length === 0
      ? 'Daftar pantauan masih kosong. Cari agent lewat panel BNB Agent Lookup di atas, lalu klik + Pantau.'
      : 'Tidak ada agent yang cocok.';
    body.innerHTML = `<tr><td colspan="10" class="empty-row">${escapeHTML(emptyMessage)}</td></tr>`;
    syncSelectionUI();
    return;
  }

  body.innerHTML = filteredAgents.map((agent) => `
    <tr>
      <td><input type="checkbox" class="row-select" data-id="${escapeHTML(agent.id)}" ${selectedAgentIds.has(agent.id) ? 'checked' : ''} /></td>
      <td><strong>${escapeHTML(agent.id)}</strong></td>
      <td>${escapeHTML(agent.name)}</td>
      <td>${escapeHTML(shortWallet(agent.wallet))}</td>
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
  syncSelectionUI();
}

function refreshDashboard() {
  renderStats();
  renderStatusChart();
  renderTrustChart();
  renderFilters();
  renderTable();
}

// Dialog konfirmasi di dalam halaman (pengganti confirm() bawaan browser,
// supaya hapus tetap jalan di semua browser termasuk saat dites otomatis).
function confirmAction(message) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    $('#confirmMessage').textContent = message;
    $('#confirmDialog').showModal();
  });
}

function closeConfirm(result) {
  const dialog = $('#confirmDialog');
  if (dialog.open) dialog.close();
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(result);
  }
}

function openDialog(agent) {
  if (!agent) return;
  const form = $('#agentForm');
  form.reset();
  $('#originalId').value = agent.id;
  $('#dialogTitle').textContent = 'Edit Agent';
  $('#agentId').value = agent.id;
  $('#agentId').readOnly = true;
  $('#agentName').value = agent.name || '';
  $('#agentWallet').value = agent.wallet || '';
  $('#agentStatus').value = agent.status || 'Pending';
  $('#agentRisk').value = agent.risk || 'Low';
  $('#agentTrust').value = agent.trust ?? 50;
  $('#agentLastSync').value = agent.lastSync || '';
  $('#agentNotes').value = agent.notes || '';
  $('#agentDialog').showModal();
  $('#agentName').focus();
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

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const originalId = $('#originalId').value;
  if (!originalId) {
    $('#agentDialog').close();
    return;
  }
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

  const index = agents.findIndex((item) => item.id === originalId);
  if (index === -1) {
    showToast('Agent tidak ditemukan.');
    return;
  }

  agents[index] = agent;
  saveWatchlist();
  refreshDashboard();
  $('#agentDialog').close();
  showToast('Data agent berhasil diperbarui.');
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
  } else if (button.dataset.action === 'delete') {
    const ok = await confirmAction(`Hapus agent ${agent.id} (${agent.name}) dari daftar pantauan?`);
    if (!ok) return;
    agents = agents.filter((item) => item.id !== agent.id);
    selectedAgentIds.delete(agent.id);
    saveWatchlist();
    refreshDashboard();
    showToast('Agent berhasil dihapus.');
  }
}

function setActiveMenu(menu) {
  document.querySelectorAll('.nav a[data-menu]').forEach((link) => {
    link.classList.toggle('active', link.dataset.menu === menu);
  });
}

function exportAgents() {
  const blob = new Blob([JSON.stringify(agents, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agents.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data agent diekspor.');
}

function openAuditDialog() {
  const rows = agents.map((agent) => `
    <div class="detail-item">
      <span>${escapeHTML(agent.id)} — ${escapeHTML(agent.name)}</span>
      <strong>${escapeHTML(agent.status)} · Trust ${Number(agent.trust)}% · Sync ${escapeHTML(agent.lastSync || '—')}</strong>
    </div>
  `).join('');

  $('#auditContent').innerHTML = agents.length
    ? `<div class="detail-grid">${rows}</div>`
    : '<p class="empty-row">Belum ada agent untuk diaudit.</p>';
  $('#auditDialog').showModal();
}

function handleMenuAction(menu) {
  setActiveMenu(menu);

  if (menu === 'overview') {
    selectedStatus = 'All';
    $('#searchInput').value = '';
    refreshDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (menu === 'agents') {
    selectedStatus = 'All';
    $('#searchInput').value = '';
    refreshDashboard();
    document.querySelector('.table-panel').scrollIntoView({ behavior: 'smooth' });
  } else if (menu === 'alerts') {
    selectedStatus = 'Alert';
    $('#searchInput').value = '';
    refreshDashboard();
    document.querySelector('.table-panel').scrollIntoView({ behavior: 'smooth' });
    showToast('Menampilkan agent berstatus Alert.');
  } else if (menu === 'reports') {
    exportAgents();
  } else if (menu === 'audit') {
    openAuditDialog();
  }
}

let bnbResults = [];

function renderBnbResults(results) {
  const container = $('#bnbLookupResults');

  if (!results.length) {
    container.innerHTML = '<p class="empty-row">Tidak ada agent yang cocok.</p>';
    return;
  }

  container.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>Agent ID</th><th>Nama</th><th>Owner</th><th>Freemint</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${results.map((item, index) => `
            <tr>
              <td><strong>${item.agentId !== null && item.agentId !== undefined ? escapeHTML(String(item.agentId)) : '—'}</strong></td>
              <td>${escapeHTML(item.name || '—')}</td>
              <td>${escapeHTML(shortWallet(item.ownerAddress))}</td>
              <td>${item.freemintCandidate ? '<span class="badge green">Freemint</span>' : '<span class="badge blue">—</span>'}</td>
              <td class="row-actions">
                <button class="action-btn" type="button" data-bnb-index="${index}" ${item.agentId === null || item.agentId === undefined ? 'disabled' : ''}>+ Pantau</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function handleBnbLookup(event) {
  event.preventDefault();
  const agentId = $('#bnbAgentId').value.trim();
  const wallet = $('#bnbWallet').value.trim();
  const name = $('#bnbName').value.trim();
  const network = $('#bnbNetwork').value;

  if (!agentId && !wallet && !name) {
    showToast('Isi salah satu: Agent ID, wallet, atau nama.');
    return;
  }

  const button = $('#bnbLookupButton');
  button.disabled = true;
  button.textContent = 'Mencari...';
  $('#bnbResultCount').textContent = 'Mencari...';
  $('#bnbLookupResults').innerHTML = '<p class="empty-row">Mencari di indexer 8004scan...</p>';

  try {
    const params = new URLSearchParams();
    if (agentId) params.set('agentId', agentId);
    if (wallet) params.set('wallet', wallet);
    if (name) params.set('name', name);
    params.set('network', network);

    const result = await fetchJson(`/api/bnb/lookup?${params.toString()}`);
    bnbResults = Array.isArray(result?.results) ? result.results : [];
    $('#bnbResultCount').textContent = `${result?.matched ?? bnbResults.length} hasil dari ${result?.total ?? bnbResults.length} agent`;
    renderBnbResults(bnbResults);
  } catch (error) {
    bnbResults = [];
    $('#bnbResultCount').textContent = 'Gagal';
    $('#bnbLookupResults').innerHTML = '<p class="empty-row">Lookup gagal. Coba lagi nanti.</p>';
    showToast(error.message || 'BNB lookup gagal.');
  } finally {
    button.disabled = false;
    button.textContent = 'Cari Agent';
  }
}

function handleBnbAdd(event) {
  const button = event.target.closest('button[data-bnb-index]');
  if (!button) return;
  const item = bnbResults[Number(button.dataset.bnbIndex)];
  if (!item || item.agentId === null || item.agentId === undefined) return;

  const id = String(item.agentId);
  if (agents.some((agent) => agent.id === id)) {
    showToast(`Agent ${id} sudah ada di daftar pantauan.`);
    return;
  }

  const agent = {
    id,
    name: item.name || `Agent ${id}`,
    wallet: item.ownerAddress || '',
    status: 'Pending',
    risk: 'Low',
    trust: 50,
    lastSync: 'Baru saja',
    notes: item.freemintCandidate ? 'Dari BNB lookup · Kandidat Freemint' : 'Dari BNB lookup'
  };

  agents.unshift(agent);
  saveWatchlist();
  refreshDashboard();
  showToast(`Agent ${id} ditambahkan ke pantauan.`);
}

function syncSelectionUI() {
  const visibleIds = Array.from(document.querySelectorAll('#agentTableBody .row-select')).map((box) => box.dataset.id);
  const selectAll = $('#selectAllCheckbox');
  if (selectAll) {
    selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selectedAgentIds.has(id));
  }
  const deleteButton = $('#deleteSelectedButton');
  if (deleteButton) {
    deleteButton.disabled = selectedAgentIds.size === 0;
    deleteButton.textContent = selectedAgentIds.size > 0 ? `Hapus yang dipilih (${selectedAgentIds.size})` : 'Hapus yang dipilih';
  }
}

async function handleDeleteSelected() {
  if (!selectedAgentIds.size) return;
  const count = selectedAgentIds.size;
  const ok = await confirmAction(`Hapus ${count} agent yang dipilih dari daftar pantauan?`);
  if (!ok) return;

  const ids = new Set(selectedAgentIds);
  agents = agents.filter((agent) => !ids.has(agent.id));
  selectedAgentIds.clear();
  saveWatchlist();
  refreshDashboard();
  showToast(`${count} agent dihapus.`);
}

function initDashboard() {
  agents = loadWatchlist();
  refreshDashboard();
}

function init() {
  initDashboard();

  $('#searchInput').addEventListener('input', renderTable);
  $('#exportButton').addEventListener('click', exportAgents);
  $('#agentForm').addEventListener('submit', handleSubmit);
  $('#agentTableBody').addEventListener('click', handleTableAction);
  $('#agentTableBody').addEventListener('change', (event) => {
    const box = event.target.closest('.row-select');
    if (!box) return;
    if (box.checked) selectedAgentIds.add(box.dataset.id);
    else selectedAgentIds.delete(box.dataset.id);
    syncSelectionUI();
  });
  $('#selectAllCheckbox').addEventListener('change', (event) => {
    document.querySelectorAll('#agentTableBody .row-select').forEach((box) => {
      box.checked = event.target.checked;
      if (event.target.checked) selectedAgentIds.add(box.dataset.id);
      else selectedAgentIds.delete(box.dataset.id);
    });
    syncSelectionUI();
  });
  $('#deleteSelectedButton').addEventListener('click', handleDeleteSelected);
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
  $('#confirmDeleteButton').addEventListener('click', () => closeConfirm(true));
  $('#cancelConfirmButton').addEventListener('click', () => closeConfirm(false));
  $('#closeConfirmDialogButton').addEventListener('click', () => closeConfirm(false));
  $('#confirmDialog').addEventListener('click', (event) => {
    if (event.target === $('#confirmDialog')) closeConfirm(false);
  });
  $('#confirmDialog').addEventListener('cancel', () => closeConfirm(false));
  $('#bnbLookupForm').addEventListener('submit', handleBnbLookup);
  $('#bnbLookupResults').addEventListener('click', handleBnbAdd);
  document.querySelectorAll('.nav a[data-menu]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      handleMenuAction(link.dataset.menu);
    });
  });
  $('#closeAuditDialogButton').addEventListener('click', () => $('#auditDialog').close());
  $('#auditCloseButton').addEventListener('click', () => $('#auditDialog').close());
  $('#auditDialog').addEventListener('click', (event) => {
    if (event.target === $('#auditDialog')) $('#auditDialog').close();
  });
}

init();
