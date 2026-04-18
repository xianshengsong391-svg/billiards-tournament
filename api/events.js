// Vercel Serverless Function - 赛事数据存储
// 使用内存存储 + 本地文件备份（Vercel 免费版方案）

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 数据文件路径（使用临时目录，Vercel 允许写入）
const DATA_DIR = process.env.VERCEL ? '/tmp' : join(process.cwd(), 'data');
const EVENTS_FILE = join(DATA_DIR, 'events.json');
const REGISTRATIONS_FILE = join(DATA_DIR, 'registrations.json');

// 内存缓存
let memoryCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 5000; // 5秒缓存

// 确保数据目录存在
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create data dir:', e);
    }
  }
}

// 从文件加载数据
function loadData() {
  const now = Date.now();
  
  // 使用缓存
  if (memoryCache && (now - lastLoadTime) < CACHE_TTL) {
    return memoryCache;
  }
  
  ensureDataDir();
  
  try {
    let events = [];
    let registrations = [];
    
    if (existsSync(EVENTS_FILE)) {
      const data = readFileSync(EVENTS_FILE, 'utf8');
      events = JSON.parse(data);
    }
    
    if (existsSync(REGISTRATIONS_FILE)) {
      const data = readFileSync(REGISTRATIONS_FILE, 'utf8');
      registrations = JSON.parse(data);
    }
    
    memoryCache = { events, registrations };
    lastLoadTime = now;
    return memoryCache;
  } catch (error) {
    console.error('Load data error:', error);
    return { events: [], registrations: [] };
  }
}

// 保存数据到文件
function saveData(key, data) {
  ensureDataDir();
  
  try {
    const file = key === 'events' ? EVENTS_FILE : REGISTRATIONS_FILE;
    writeFileSync(file, JSON.stringify(data, null, 2));
    
    // 更新缓存
    if (memoryCache) {
      memoryCache[key] = data;
    }
    return true;
  } catch (error) {
    console.error('Save data error:', error);
    return false;
  }
}

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
    // 加载当前数据
    let { events, registrations } = loadData();

    switch (action) {
      case 'list':
        return res.json({ success: true, data: events });
      
      case 'get':
        const event = events.find(e => e.id === req.query.id);
        return res.json({ success: true, data: event || null });
      
      case 'create':
        const newEvent = req.body;
        newEvent.createdAt = Date.now();
        events.push(newEvent);
        saveData('events', events);
        return res.json({ success: true, data: newEvent });
      
      case 'update':
        const idx = events.findIndex(e => e.id === req.body.id);
        if (idx >= 0) {
          events[idx] = { ...events[idx], ...req.body };
          saveData('events', events);
          return res.json({ success: true, data: events[idx] });
        }
        return res.json({ success: false, error: 'Event not found' });
      
      case 'delete':
        events = events.filter(e => e.id !== req.query.id);
        saveData('events', events);
        return res.json({ success: true });
      
      case 'register':
        // 选手报名
        const reg = req.body;
        reg.submittedAt = Date.now();
        registrations.push(reg);
        saveData('registrations', registrations);
        
        // 同时更新赛事的players
        const evt = events.find(e => e.id === reg.eventId);
        if (evt) {
          if (!evt.players) evt.players = [];
          evt.players.push(reg.player);
          saveData('events', events);
        }
        return res.json({ success: true, data: reg });
      
      case 'registrations':
        const regs = registrations.filter(r => r.eventId === req.query.eventId);
        return res.json({ success: true, data: regs });
      
      default:
        return res.json({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Handler error:', error);
    return res.json({ success: false, error: error.message });
  }
}
