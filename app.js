const API_URL = 'http://localhost:3000/api/agents';
const statusFilters = ['All', 'Active', 'Pending', 'Alert'];
let agents = [];
let selectedStatus = 'All';
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

async function apiRequest(method, payload, id = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (payload !== undefined) options.body = JSON.stringify(payload);

  const url = id ? `${API_URL}?id=${encodeURIComponent(id)}` : API_URL;
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof result === 'object' && result && result.message ? result.message : 'Request failed');
  }

  return result;
}

async function loadAgents() {
  try {
    const data = await apiRequest('GET');
    if (Array.isArray(data) && data.every(validAgent)) {
      return data;
    }
  } catch (error) {
    console.warn('API load failed:', error.message);
  }

  try {
    const fallback = JSON.parse(localStorage.getItem('agentram_local_fallback') || '[]');
    if (Array.isArray(fallback) && fallback.every(validAgent)) {
      return fallback;
    }
  } catch (error) {
    // ignore fallback parse issue
  }

  return [];
}

function saveAgentsLocally() {
  try {
    localStorage.setItem('agentram_local_fallback', JSON.stringify(agents));
  } catch (error) {
    // ignore local storage errors
  }
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
  const detailContent = $('#detailContent');
  detailContent.innerHTML = `
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

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function exportJSON() {
  const blob = new Blob([`${JSON.stringify(agents, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agents.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data agent diekspor sebagai JSON.');
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
      await apiRequest('PUT', agent);
      showToast('Data agent berhasil diperbarui.');
    } else {
      await apiRequest('POST', agent);
      showToast('Agent berhasil ditambahkan.');
    }

    agents = await loadAgents();
    saveAgentsLocally();
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
      await apiRequest('DELETE', undefined, agent.id);
      agents = await loadAgents();
      saveAgentsLocally();
      refreshDashboard();
      showToast('Agent berhasil dihapus.');
    } catch (error) {
      showToast(error.message || 'Gagal menghapus agent.');
    }
  }
}

async function init() {
  agents = await loadAgents();
  saveAgentsLocally();
  refreshDashboard();

  $('#searchInput').addEventListener('input', renderTable);
  $('#addAgentButton').addEventListener('click', () => openDialog());
  $('#exportButton').addEventListener('click', exportJSON);
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
























































