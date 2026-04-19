// Cloudflare Worker - 台球赛事管理后端 API
// 使用 GitHub Gist 持久化存储

const GIST_API = 'https://api.github.com/gists';

// 内存缓存（减少 Gist API 调用）
let memoryCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 10000; // 10秒缓存

// 从 GitHub Gist 读取数据
async function loadFromGist(env) {
  const now = Date.now();
  if (memoryCache && (now - lastLoadTime) < CACHE_TTL) {
    return memoryCache;
  }

  try {
    const res = await fetch(`${GIST_API}/${env.GIST_ID}`, {
      headers: {
        'Authorization': `token ${env.GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'billiards-app'
      }
    });

    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);

    const gist = await res.json();
    const content = gist.files['data.json']?.content || '{"events":[],"registrations":[],"adminPwd":""}';
    memoryCache = JSON.parse(content);
    // 确保有 adminPwd 字段
    if (!memoryCache.hasOwnProperty('adminPwd')) {
      memoryCache.adminPwd = '';
    }
    lastLoadTime = now;
    return memoryCache;
  } catch (e) {
    console.error('loadFromGist error:', e);
    return { events: [], registrations: [], adminPwd: '' };
  }
}

// 保存数据到 GitHub Gist
async function saveToGist(data, env) {
  try {
    const res = await fetch(`${GIST_API}/${env.GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${env.GIST_TOKEN}`,
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

    memoryCache = data;
    lastLoadTime = Date.now();
    return true;
  } catch (e) {
    console.error('saveToGist error:', e);
    return false;
  }
}

// CORS 响应头
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders() });
    }

    // 检查配置
    if (!env.GIST_TOKEN || !env.GIST_ID) {
      return new Response(
        JSON.stringify({ success: false, error: 'Gist not configured' }),
        { status: 500, headers: corsHeaders() }
      );
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    try {
      let { events, registrations, adminPwd } = await loadFromGist(env);

      switch (action) {
        case 'list':
          return new Response(
            JSON.stringify({ success: true, data: events }),
            { headers: corsHeaders() }
          );

        case 'get': {
          const id = url.searchParams.get('id');
          const event = events.find(e => e.id === id);
          return new Response(
            JSON.stringify({ success: true, data: event || null }),
            { headers: corsHeaders() }
          );
        }

        // 密码管理
        case 'getPassword': {
          // 返回是否已设置密码（不返回密码本身）
          return new Response(
            JSON.stringify({ success: true, hasPassword: !!adminPwd }),
            { headers: corsHeaders() }
          );
        }

        case 'setPassword': {
          const { password } = await request.json();
          if (!password || password.length < 4) {
            return new Response(
              JSON.stringify({ success: false, error: '密码至少4位' }),
              { headers: corsHeaders() }
            );
          }
          adminPwd = password;
          await saveToGist({ events, registrations, adminPwd }, env);
          return new Response(
            JSON.stringify({ success: true }),
            { headers: corsHeaders() }
          );
        }

        case 'checkPassword': {
          const { password } = await request.json();
          const valid = (password === adminPwd);
          return new Response(
            JSON.stringify({ success: true, valid }),
            { headers: corsHeaders() }
          );
        }

        case 'create': {
          const newEvent = await request.json();
          newEvent.createdAt = Date.now();
          events.push(newEvent);
          await saveToGist({ events, registrations, adminPwd }, env);
          return new Response(
            JSON.stringify({ success: true, data: newEvent }),
            { headers: corsHeaders() }
          );
        }

        case 'update': {
          const updateData = await request.json();
          const idx = events.findIndex(e => e.id === updateData.id);
          if (idx >= 0) {
            events[idx] = { ...events[idx], ...updateData };
            await saveToGist({ events, registrations, adminPwd }, env);
            return new Response(
              JSON.stringify({ success: true, data: events[idx] }),
              { headers: corsHeaders() }
            );
          }
          return new Response(
            JSON.stringify({ success: false, error: 'Event not found' }),
            { headers: corsHeaders() }
          );
        }

        case 'delete': {
          const id = url.searchParams.get('id');
          events = events.filter(e => e.id !== id);
          await saveToGist({ events, registrations, adminPwd }, env);
          return new Response(
            JSON.stringify({ success: true }),
            { headers: corsHeaders() }
          );
        }

        case 'register': {
          const reg = await request.json();
          reg.submittedAt = Date.now();
          registrations.push(reg);

          // 同时更新赛事的 players 列表
          const evt = events.find(e => e.id === reg.eventId);
          if (evt) {
            if (!evt.players) evt.players = [];
            evt.players.push(reg.player);
          }

          await saveToGist({ events, registrations, adminPwd }, env);
          return new Response(
            JSON.stringify({ success: true, data: reg }),
            { headers: corsHeaders() }
          );
        }

        case 'registrations': {
          const eventId = url.searchParams.get('eventId');
          const regs = registrations.filter(r => r.eventId === eventId);
          return new Response(
            JSON.stringify({ success: true, data: regs }),
            { headers: corsHeaders() }
          );
        }

        default:
          return new Response(
            JSON.stringify({ success: false, error: 'Unknown action' }),
            { headers: corsHeaders() }
          );
      }
    } catch (error) {
      console.error('Handler error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: corsHeaders() }
      );
    }
  }
};
