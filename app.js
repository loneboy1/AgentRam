const agents = [
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
  },
  {
    id: 'FA-1088',
    name: 'Alya Putri',
    wallet: '0x9EE4...AB42',
    status: 'Active',
    risk: 'Low',
    trust: 97,
    lastSync: '1 min ago',
    notes: 'No critical events detected'
  },
  {
    id: 'FA-1102',
    name: 'Fahri Zain',
    wallet: '0x5531...10FA',
    status: 'Alert',
    risk: 'Medium',
    trust: 64,
    lastSync: '9 min ago',
    notes: 'Manual review required'
  },
  {
    id: 'FA-1120',
    name: 'Dina Karina',
    wallet: '0xF097...87DB',
    status: 'Active',
    risk: 'Low',
    trust: 90,
    lastSync: '3 min ago',
    notes: 'Rewards distribution normal'
  },
  {
    id: 'FA-1139',
    name: 'Bima Hadi',
    wallet: '0x12AF...77B2',
    status: 'Pending',
    risk: 'Low',
    trust: 81,
    lastSync: '21 min ago',
    notes: 'Awaiting second credential scan'
  },
  {
    id: 'FA-1164',
    name: 'Sinta Lestari',
    wallet: '0xB708...9C40',
    status: 'Active',
    risk: 'Low',
    trust: 96,
    lastSync: '6 min ago',
    notes: 'Strong compliance score'
  }
];

const statusFilters = ['All', 'Active', 'Pending', 'Alert'];
let selectedStatus = 'All';

function statusBadgeClass(status) {
  if (status === 'Active') return 'green';
  if (status === 'Pending') return 'yellow';
  if (status === 'Alert') return 'red';
  return 'blue';
}

function riskBadgeClass(risk) {
  if (risk === 'Low') return 'green';
  if (risk === 'Medium') return 'yellow';
  if (risk === 'High') return 'red';
  return 'blue';
}

function renderStats() {
  const total = agents.length;
  const active = agents.filter((agent) => agent.status === 'Active').length;
  const pending = agents.filter((agent) => agent.status === 'Pending').length;
  const alert = agents.filter((agent) => agent.status === 'Alert').length;

  const stats = [
    { label: 'Total Agent', value: total, delta: '+12%' },
    { label: 'Active', value: active, delta: '+8%' },
    { label: 'Pending', value: pending, delta: '+3%' },
    { label: 'Alert', value: alert, delta: '-2%' }
  ];

  const statsGrid = document.getElementById('statsGrid');
  statsGrid.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat-card">
          <div class="label">
            <span>${stat.label}</span>
            <span>↗</span>
          </div>
          <div class="value">
            <strong>${stat.value}</strong>
            <small>${stat.delta}</small>
          </div>
        </div>
      `
    )
    .join('');
}

function renderFilters() {
  const container = document.getElementById('statusFilters');
  container.innerHTML = statusFilters
    .map(
      (status) => `
        <button class="filter-chip ${selectedStatus === status ? 'active' : ''}" data-status="${status}">
          ${status}
        </button>
      `
    )
    .join('');

  container.querySelectorAll('.filter-chip').forEach((button) => {
    button.addEventListener('click', () => {
      selectedStatus = button.dataset.status;
      renderFilters();
      renderTable();
    });
  });
}

function renderTable() {
  const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();

  const filteredAgents = agents.filter((agent) => {
    const matchesStatus = selectedStatus === 'All' || agent.status === selectedStatus;
    const searchable = [agent.id, agent.name, agent.wallet, agent.notes, agent.status].join(' ').toLowerCase();
    const matchesSearch = !searchValue || searchable.includes(searchValue);
    return matchesStatus && matchesSearch;
  });

  const tableBody = document.getElementById('agentTableBody');
  const resultCount = document.getElementById('resultCount');

  resultCount.textContent = `${filteredAgents.length} results`;

  if (filteredAgents.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-row">Tidak ada data yang cocok dengan filter saat ini.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredAgents
    .map(
      (agent) => `
        <tr>
          <td><strong>${agent.id}</strong></td>
          <td>${agent.name}</td>
          <td>${agent.wallet}</td>
          <td>
            <span class="badge ${statusBadgeClass(agent.status)}">
              <span class="status-dot" style="background:${agent.status === 'Active' ? '#22c55e' : agent.status === 'Pending' ? '#fbbf24' : '#f87171'}"></span>
              ${agent.status}
            </span>
          </td>
          <td>
            <span class="badge ${riskBadgeClass(agent.risk)}">${agent.risk}</span>
          </td>
          <td>
            <span class="badge ${agent.trust >= 85 ? 'green' : agent.trust >= 70 ? 'yellow' : 'blue'}">${agent.trust}%</span>
          </td>
          <td>${agent.lastSync}</td>
          <td>${agent.notes}</td>
          <td><button class="action-btn">View</button></td>
        </tr>
      `
    )
    .join('');
}

function init() {
  renderStats();
  renderFilters();
  renderTable();

  document.getElementById('searchInput').addEventListener('input', renderTable);
}

init();
