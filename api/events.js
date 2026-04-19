// Vercel Serverless Function - 赛事数据存储
// 使用 GitHub Gist 持久化存储（解决 /tmp 数据丢失问题）

const GIST_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = process.env.GIST_ID;
const GIST_API = 'https://api.github.com/gists';

// 内存缓存（减少 Gist API 调用）
let memoryCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 10000; // 10秒缓存

// 从 GitHub Gist 读取数据
async function loadFromGist() {
  const now = Date.now();
  if (memoryCache && (now - lastLoadTime) < CACHE_TTL) {
    return memoryCache;
  }

  try {
    const res = await fetch(`${GIST_API}/${GIST_ID}`, {
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'billiards-app'
      }
    });

    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);

    const gist = await res.json();
    const content = gist.files['data.json']?.content || '{"events":[],"registrations":[]}';
    memoryCache = JSON.parse(content);
    lastLoadTime = now;
    return memoryCache;
  } catch (e) {
    console.error('loadFromGist error:', e);
    return { events: [], registrations: [] };
  }
}

// 保存数据到 GitHub Gist
async function saveToGist(data) {
  try {
    const res = await fetch(`${GIST_API}/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'billiards-app'
      },
      body: JSON.stringify({
        files: {
          'data.json': {
            content: JSON.stringify(data)
          }
        }
      })
    });

    if (!res.ok) throw new Error(`Gist save failed: ${res.status}`);

    // 更新缓存
    memoryCache = data;
    lastLoadTime = Date.now();
    return true;
  } catch (e) {
    console.error('saveToGist error:', e);
    return false;
  }
}

export default async function handler(req, res) {
  // 设置CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 检查配置
  if (!GIST_TOKEN || !GIST_ID) {
    return res.status(500).json({ success: false, error: 'Gist not configured. Set GIST_TOKEN and GIST_ID env vars.' });
  }

  const { action } = req.query;

  try {
    let { events, registrations } = await loadFromGist();

    switch (action) {
      case 'list':
        return res.json({ success: true, data: events });

      case 'get': {
        const event = events.find(e => e.id === req.query.id);
        return res.json({ success: true, data: event || null });
      }

      case 'create': {
        const newEvent = req.body;
        newEvent.createdAt = Date.now();
        events.push(newEvent);
        await saveToGist({ events, registrations });
        return res.json({ success: true, data: newEvent });
      }

      case 'update': {
        const idx = events.findIndex(e => e.id === req.body.id);
        if (idx >= 0) {
          events[idx] = { ...events[idx], ...req.body };
          await saveToGist({ events, registrations });
          return res.json({ success: true, data: events[idx] });
        }
        return res.json({ success: false, error: 'Event not found' });
      }

      case 'delete': {
        events = events.filter(e => e.id !== req.query.id);
        await saveToGist({ events, registrations });
        return res.json({ success: true });
      }

      case 'register': {
        const reg = req.body;
        reg.submittedAt = Date.now();
        registrations.push(reg);

        // 同时更新赛事的 players 列表
        const evt = events.find(e => e.id === reg.eventId);
        if (evt) {
          if (!evt.players) evt.players = [];
          evt.players.push(reg.player);
        }

        await saveToGist({ events, registrations });
        return res.json({ success: true, data: reg });
      }

      case 'registrations': {
        const regs = registrations.filter(r => r.eventId === req.query.eventId);
        return res.json({ success: true, data: regs });
      }

      default:
        return res.json({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Handler error:', error);
    return res.json({ success: false, error: error.message });
  }
}
