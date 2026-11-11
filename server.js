const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'agents.json');

function ensureDataFile() {
  if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = [
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
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function readAgents() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeAgents(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (parsedUrl.pathname === '/api/agents') {
    if (req.method === 'GET') {
      sendJson(res, 200, readAgents());
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const agents = readAgents();
          const existing = agents.find((agent) => agent.id === data.id);
          if (existing) {
            sendJson(res, 409, { message: 'Agent ID already exists' });
            return;
          }
          agents.unshift(data);
          writeAgents(agents);
          sendJson(res, 201, data);
        } catch (error) {
          sendJson(res, 400, { message: 'Invalid JSON payload' });
        }
      });
      return;
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const agents = readAgents();
          const idx = agents.findIndex((agent) => agent.id === data.id);
          if (idx === -1) {
            sendJson(res, 404, { message: 'Agent not found' });
            return;
          }
          agents[idx] = { ...agents[idx], ...data };
          writeAgents(agents);
          sendJson(res, 200, agents[idx]);
        } catch (error) {
          sendJson(res, 400, { message: 'Invalid JSON payload' });
        }
      });
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
  console.log(`AgentRam local API running at http://localhost:${PORT}`);
});
