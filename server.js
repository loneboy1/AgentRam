const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'agents.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const sessions = new Map();

function ensureJsonFile(filePath, defaultData) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

function ensureSeedData() {
  ensureJsonFile(DATA_FILE, [
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
    }
  ]);

  ensureJsonFile(USERS_FILE, [
    { username: 'admin', password: 'admin123', role: 'admin' }
  ]);
}

function readJson(filePath) {
  ensureSeedData();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readAgents() {
  return readJson(DATA_FILE);
}

function writeAgents(data) {
  writeJson(DATA_FILE, data);
}

function getUserFromDb(username, password) {
  const users = readJson(USERS_FILE);
  return users.find((user) => user.username === username && user.password === password) || null;
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

  if (parsedUrl.pathname === '/api/login') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    try {
      const body = await parseBody(req);
      const user = getUserFromDb(body.username || '', body.password || '');
      if (!user) {
        sendJson(res, 401, { message: 'Username atau password salah.' });
        return;
      }

      const token = createSession(user.username);
      sendJson(res, 200, {
        token,
        user: { username: user.username, role: user.role }
      });
      return;
    } catch (error) {
      sendJson(res, 400, { message: error.message || 'Invalid payload' });
      return;
    }
  }

  if (parsedUrl.pathname === '/api/me') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    sendJson(res, 200, { username: session.username, role: 'admin' });
    return;
  }

  if (parsedUrl.pathname === '/api/agents') {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 401, { message: 'Unauthorized' });
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, readAgents());
      return;
    }

    if (req.method === 'POST') {
      try {
        const payload = await parseBody(req);
        const agents = readAgents();
        const existing = agents.find((agent) => agent.id === payload.id);
        if (existing) {
          sendJson(res, 409, { message: 'Agent ID already exists' });
          return;
        }
        agents.unshift(payload);
        writeAgents(agents);
        sendJson(res, 201, payload);
      } catch (error) {
        sendJson(res, 400, { message: error.message || 'Invalid JSON payload' });
      }
      return;
    }

    if (req.method === 'PUT') {
      try {
        const payload = await parseBody(req);
        const agents = readAgents();
        const index = agents.findIndex((agent) => agent.id === payload.id);
        if (index === -1) {
          sendJson(res, 404, { message: 'Agent not found' });
          return;
        }

        agents[index] = { ...agents[index], ...payload };
        writeAgents(agents);
        sendJson(res, 200, agents[index]);
      } catch (error) {
        sendJson(res, 400, { message: error.message || 'Invalid JSON payload' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { message: 'Missing id' });
        return;
      }

      const agents = readAgents();
      const filtered = agents.filter((agent) => agent.id !== id);
      if (filtered.length === agents.length) {
        sendJson(res, 404, { message: 'Agent not found' });
        return;
      }

      writeAgents(filtered);
      sendJson(res, 200, { message: 'Agent deleted successfully' });
      return;
    }
  }

  sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`AgentRam API running at http://localhost:${PORT}`);
  console.log('Default login: admin / admin123');
});

module.exports = server;










































































































































