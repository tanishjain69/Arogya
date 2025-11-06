// Lightweight LLM proxy for AI Seek
// Usage: set OPENAI_API_KEY or OPENROUTER_API_KEY in environment, then run: node server.js

const http = require('http');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5050;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

async function callOpenAI(query) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a health information assistant. Provide concise, structured, and clear guidance. Include a brief disclaimer: not a substitute for professional medical advice; in emergencies, call local emergency number.' },
        { role: 'user', content: query }
      ],
      temperature: 0.5,
    }),
  });
  const data = await resp.json();
  const answer = data?.choices?.[0]?.message?.content || 'No response';
  return { answer, provider: 'openai' };
}

async function callOpenRouter(query) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a health information assistant. Provide concise, structured, and clear guidance. Include a brief disclaimer: not a substitute for professional medical advice; in emergencies, call local emergency number.' },
        { role: 'user', content: query }
      ],
      temperature: 0.5,
    }),
  });
  const data = await resp.json();
  const answer = data?.choices?.[0]?.message?.content || 'No response';
  return { answer, provider: 'openrouter' };
}

const server = http.createServer(async (req, res) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  if (req.url === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.url === '/ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const query = (data.query || '').trim();
        if (!query) return sendJson(res, 400, { error: 'missing_query' });

        if (OPENAI_KEY) {
          try { const out = await callOpenAI(query); return sendJson(res, 200, out); } catch (e) {}
        }
        if (OPENROUTER_KEY) {
          try { const out = await callOpenRouter(query); return sendJson(res, 200, out); } catch (e) {}
        }

        // No key configured
        return sendJson(res, 200, { error: 'no_key', message: 'LLM key not configured' });
      } catch (err) {
        return sendJson(res, 500, { error: 'server_error', message: err.message });
      }
    });
    return;
  }

  // 404
  sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`LLM proxy server running on http://127.0.0.1:${PORT}`);
});