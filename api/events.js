// Vercel Serverless Function - 赛事数据存储
// 使用内存存储（Vercel免费版每次请求后可能重置，但比localStorage强）

// 内存数据库（注意：Vercel免费版函数冷启动会重置，建议后续升级到Vercel KV）
let memoryDB = {
  events: [],
  registrations: []
};

export default async function handler(req, res) {
  // 设置CORS，允许前端访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'list':
        return res.json({ success: true, data: memoryDB.events });
      
      case 'get':
        const event = memoryDB.events.find(e => e.id === req.query.id);
        return res.json({ success: true, data: event || null });
      
      case 'create':
        const newEvent = req.body;
        newEvent.createdAt = Date.now();
        memoryDB.events.push(newEvent);
        return res.json({ success: true, data: newEvent });
      
      case 'update':
        const idx = memoryDB.events.findIndex(e => e.id === req.body.id);
        if (idx >= 0) {
          memoryDB.events[idx] = { ...memoryDB.events[idx], ...req.body };
          return res.json({ success: true, data: memoryDB.events[idx] });
        }
        return res.json({ success: false, error: 'Event not found' });
      
      case 'delete':
        memoryDB.events = memoryDB.events.filter(e => e.id !== req.query.id);
        return res.json({ success: true });
      
      case 'register':
        // 选手报名
        const reg = req.body;
        reg.submittedAt = Date.now();
        memoryDB.registrations.push(reg);
        
        // 同时更新赛事的players
        const evt = memoryDB.events.find(e => e.id === reg.eventId);
        if (evt) {
          if (!evt.players) evt.players = [];
          evt.players.push(reg.player);
        }
        return res.json({ success: true, data: reg });
      
      case 'registrations':
        const regs = memoryDB.registrations.filter(r => r.eventId === req.query.eventId);
        return res.json({ success: true, data: regs });
      
      default:
        return res.json({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
}
