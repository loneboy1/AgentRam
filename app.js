<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgentRam Dashboard</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="loginScreen" class="auth-shell hidden">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="brand-mark">A</div>
          <h1>AgentRam</h1>
        </div>

        <form id="loginForm" class="auth-form" novalidate>
          <label>
            Username
            <input id="loginUsername" name="username" type="text" placeholder="admin" required />
          </label>
          <label>
            Password
            <input id="loginPassword" name="password" type="password" placeholder="••••••••" required />
          </label>
          <p id="loginError" class="login-error" aria-live="polite"></p>
          <button id="loginSubmit" class="primary-btn full-width" type="submit">Masuk</button>
        </form>
      </div>
    </div>

    <div id="app" class="app-shell">
      <aside class="sidebar">
        <div class="brand-wrap">
          <div class="brand-mark">A</div>
          <h1>AgentRam</h1>
        </div>

        <div>
          <p class="eyebrow">Navigation</p>
          <nav class="nav">
            <a href="#" class="active">Overview</a>
            <a href="#">Agents</a>
            <a href="#">Risk Matrix</a>
            <a href="#">Audit Log</a>
          </nav>
        </div>

        <div class="health-card">
          <span>System health</span>
          <h3>99.2%</h3>
          <span>Stable and synced</span>
        </div>
      </aside>

      <main class="main-content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Operations</p>
            <h2>Agent Overview</h2>
          </div>

          <div class="topbar-actions">
            <div class="user-pill">👤 <span id="usernameLabel">admin</span></div>
            <button id="logoutButton" class="secondary-btn" type="button">Logout</button>
          </div>
        </header>

        <section id="statsGrid" class="stats-grid"></section>

        <div class="charts-grid">
          <section class="chart-card">
            <div class="chart-header">
              <h3>Agent Status</h3>
            </div>
            <div id="statusChart" class="bar-chart"></div>
          </section>

          <section class="chart-card">
            <div class="chart-header">
              <h3>Average Trust</h3>
            </div>
            <div id="trustChart"></div>
          </section>
        </div>

        <section class="wide-panel">
          <div class="panel-header">
            <h3>Agents</h3>
            <span id="resultCount" class="result-badge">0 hasil</span>
          </div>

          <div class="topbar-actions">
            <div class="search-box">
              <input id="searchInput" type="search" placeholder="Cari berdasarkan nama, wallet, status, atau note" />
            </div>
            <div id="statusFilters" class="filter-row"></div>
            <button id="addAgentButton" class="primary-btn" type="button">Tambah Agent</button>
            <button id="exportButton" class="secondary-btn" type="button">Export</button>
          </div>
        </section>

        <section class="table-panel">
          <div class="table-header">
            <h3>Registry</h3>
          </div>

          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Agent ID</th>
                  <th>Nama</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Trust</th>
                  <th>Last Sync</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="agentTableBody"></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>

    <div id="toast" class="toast" aria-live="polite"></div>

    <dialog id="agentDialog" class="agent-dialog">
      <div class="dialog-header">
        <h2 id="dialogTitle">Tambah Agent</h2>
        <button type="button" class="icon-btn" id="closeDialogButton" aria-label="Tutup">×</button>
      </div>

      <form id="agentForm">
        <input type="hidden" id="originalId" name="originalId" />
        <div class="form-grid">
          <label>
            Agent ID
            <input id="agentId" name="id" type="text" required />
          </label>
          <label>
            Nama Agent
            <input id="agentName" name="name" type="text" required />
          </label>
          <label>
            Wallet
            <input id="agentWallet" name="wallet" type="text" placeholder="0x..." />
          </label>
          <label>
            Status
            <select id="agentStatus" name="status">
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Alert">Alert</option>
            </select>
          </label>
          <label>
            Risk
            <select id="agentRisk" name="risk">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>
          <label>
            Trust (%)
            <input id="agentTrust" name="trust" type="number" min="0" max="100" value="80" required />
          </label>
          <label>
            Last Sync
            <input id="agentLastSync" name="lastSync" type="text" />
          </label>
          <label class="full-width-form">
            Notes
            <textarea id="agentNotes" name="notes" rows="4"></textarea>
          </label>
        </div>

        <div class="dialog-actions">
          <button type="button" id="cancelDialogButton" class="secondary-btn">Batal</button>
          <button type="submit" class="primary-btn">Simpan</button>
        </div>
      </form>
    </dialog>

    <dialog id="agentDetailDialog" class="detail-dialog">
      <div class="dialog-header">
        <h2>Detail Agent</h2>
        <button type="button" class="icon-btn" id="closeDetailDialogButton" aria-label="Tutup">×</button>
      </div>
      <div id="detailContent" class="detail-content"></div>
      <div class="dialog-actions">
        <button type="button" id="detailCloseButton" class="primary-btn">Tutup</button>
      </div>
    </dialog>

    <script src="app.js"></script>
  </body>
</html>
