// API 客户端 - 对接Vercel后端
const API_BASE = 'https://billiards-api.xianshengsong391.workers.dev';

const api = {
  // 获取所有赛事
  async listEvents() {
    const res = await fetch(`${API_BASE}?action=list`);
    const data = await res.json();
    return data.success ? data.data : [];
  },

  // 获取单个赛事
  async getEvent(id) {
    const res = await fetch(`${API_BASE}?action=get&id=${id}`);
    const data = await res.json();
    return data.success ? data.data : null;
  },

  // 创建赛事
  async createEvent(eventData) {
    const res = await fetch(`${API_BASE}?action=create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    });
    const data = await res.json();
    return data.success ? data.data : null;
  },

  // 更新赛事
  async updateEvent(eventData) {
    const res = await fetch(`${API_BASE}?action=update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    });
    const data = await res.json();
    return data.success ? data.data : null;
  },

  // 删除赛事
  async deleteEvent(id) {
    const res = await fetch(`${API_BASE}?action=delete&id=${id}`);
    const data = await res.json();
    return data.success;
  },

  // 提交报名
  async register(eventId, playerData) {
    const res = await fetch(`${API_BASE}?action=register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        player: playerData
      })
    });
    const data = await res.json();
    return data.success;
  },

  // 获取报名列表
  async getRegistrations(eventId) {
    const res = await fetch(`${API_BASE}?action=registrations&eventId=${eventId}`);
    const data = await res.json();
    return data.success ? data.data : [];
  }
};

// 导出供其他文件使用
window.api = api;
