/**
 * Our Space - 后端服务器
 * Node.js + Express + Socket.io
 * 支持数据持久化 + 离线配对 + 云部署
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// CORS for Socket.io - allow all origins in development, restrict in production
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins (can be restricted later)
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 1e7 // 10MB for photo uploads
});

// Use env PORT (required for Render, Railway, Fly.io etc.) or default 3000
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve frontend (when deployed as a single app, frontend is in ../frontend)
const frontendPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// Also serve uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// CORS middleware for REST API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));

// Health check endpoint (for Render monitoring)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// ===== Data persistence =====

function roomFilePath(roomKey) {
  return path.join(DATA_DIR, `${roomKey}.json`);
}

function loadRoom(roomKey) {
  const fp = roomFilePath(roomKey);
  if (fs.existsSync(fp)) {
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      console.error(`Failed to load room ${roomKey}:`, e);
    }
  }
  return null;
}

function saveRoom(roomKey, room) {
  const fp = roomFilePath(roomKey);
  const toSave = {
    milestones: room.milestones,
    notes: room.notes,
    photos: room.photos.map(p => ({
      id: p.id,
      by: p.by,
      time: p.time,
      file: p.file
    })),
    petState: room.petState,
    wishes: room.wishes || [],
    events: room.events || [],
    moods: room.moods || []
  };
  fs.writeFileSync(fp, JSON.stringify(toSave, null, 2), 'utf8');
}

function ensureRoom(roomKey) {
  const existing = loadRoom(roomKey);
  if (existing) return existing;
  const room = {
    milestones: [],
    notes: [],
    photos: [],
    petState: { hunger: 80, happy: 70, energy: 60 },
    wishes: [],
    events: [],
    moods: []
  };
  saveRoom(roomKey, room);
  return room;
}

function getRoomKey(name1, name2) {
  return [name1, name2].sort().join('__');
}

// ===== Pairing system (persistent) =====

const pairsFilePath = path.join(DATA_DIR, 'pairs.json');

function loadPairs() {
  if (fs.existsSync(pairsFilePath)) {
    try { return JSON.parse(fs.readFileSync(pairsFilePath, 'utf8')); }
    catch (e) { return {}; }
  }
  return {};
}

function savePairs(pairs) {
  fs.writeFileSync(pairsFilePath, JSON.stringify(pairs, null, 2), 'utf8');
}

let pairs = loadPairs();
const onlineUsers = {};

// ===== REST API =====

app.post('/api/check-pair', (req, res) => {
  const { inviteCode, myName } = req.body;
  const pair = Object.values(pairs).find(p => p.inviteCode === inviteCode);
  if (pair) {
    res.json({ paired: true, partnerName: pair.user1 === myName ? pair.user2 : pair.user1 });
  } else {
    res.json({ paired: false });
  }
});

app.post('/api/create-pair', (req, res) => {
  const { myName, partnerCode } = req.body;
  const pair = Object.values(pairs).find(p => p.inviteCode === partnerCode);
  if (pair) {
    const partnerName = pair.user1 === myName ? pair.user2 : pair.user1;
    res.json({ success: true, partnerName });
    return;
  }
  const targetPair = Object.values(pairs).find(p => p.inviteCode === partnerCode);
  if (!targetPair) {
    res.json({ success: false, msg: '邀请码无效，请确认对方是否已注册' });
    return;
  }
  res.json({ success: true, partnerName: targetPair.user1 === myName ? targetPair.user2 : targetPair.user1 });
});

// Upload photo via REST
app.post('/api/upload-photo', (req, res) => {
  const { src, by, time, roomKey, id } = req.body;

  if (!src || !roomKey) {
    res.json({ success: false, msg: 'Missing data' });
    return;
  }

  const matches = src.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    res.json({ success: false, msg: 'Invalid image format' });
    return;
  }

  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const filename = `${id || Date.now().toString(36)}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(matches[2], 'base64');
  fs.writeFileSync(filepath, buffer);

  const room = ensureRoom(roomKey);
  const photoEntry = {
    id: id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    by: by,
    time: time,
    file: filename
  };

  room.photos.push(photoEntry);
  saveRoom(roomKey, room);

  io.to(roomKey).emit('photo-new', {
    ...photoEntry,
    src: `/uploads/${filename}`
  });

  res.json({ success: true, photo: { ...photoEntry, src: `/uploads/${filename}` } });
});

// ===== Socket.io =====

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('register', (data) => {
    const { name, inviteCode } = data;
    onlineUsers[name] = { socketId: socket.id, inviteCode };
    socket.data = { name, inviteCode };

    const existingPair = Object.values(pairs).find(p => p.user1 === name || p.user2 === name);

    if (existingPair) {
      const partnerName = existingPair.user1 === name ? existingPair.user2 : existingPair.user1;
      socket.emit('pair-info', { partnerName, paired: true, inviteCode: existingPair.inviteCode });
    } else if (inviteCode) {
      const waitingPair = Object.values(pairs).find(p => p.inviteCode === inviteCode);
      if (waitingPair) {
        const partnerName = waitingPair.user1 === name ? waitingPair.user2 : waitingPair.user1;
        socket.emit('pair-info', { partnerName, paired: true });
      } else {
        pairs[`pending_${name}`] = { user1: name, user2: null, inviteCode: inviteCode };
        savePairs(pairs);
        socket.emit('pair-info', { paired: false, inviteCode: inviteCode });
      }
    }

    console.log(`Registered: ${name} (invite: ${inviteCode || 'N/A'})`);
  });

  socket.on('pair-request', (data) => {
    const { code, name } = data;
    const pendingEntry = Object.entries(pairs).find(([key, p]) => p.inviteCode === code);

    if (!pendingEntry) {
      socket.emit('pair-error', { msg: '邀请码无效，请确认对方是否已注册' });
      return;
    }

    const [pendingKey, pendingPair] = pendingEntry;
    const partnerName = pendingPair.user1;
    const pairId = getRoomKey(name, partnerName);

    delete pairs[pendingKey];
    delete pairs[`pending_${name}`];

    pairs[pairId] = {
      user1: [name, partnerName].sort()[0],
      user2: [name, partnerName].sort()[1],
      inviteCode: code
    };
    savePairs(pairs);

    socket.emit('pair-success', { partnerName });
    const partnerOnline = onlineUsers[partnerName];
    if (partnerOnline) {
      io.to(partnerOnline.socketId).emit('paired-by', { partnerName: name });
    }

    console.log(`Paired: ${name} & ${partnerName}`);
  });

  socket.on('join-room', (data) => {
    const { name, partnerName } = data;
    const roomKey = getRoomKey(name, partnerName);
    socket.join(roomKey);
    socket.data.roomKey = roomKey;

    const room = ensureRoom(roomKey);

    const roomData = {
      milestones: room.milestones,
      notes: room.notes,
      photos: room.photos.map(p => ({
        ...p,
        src: p.file ? `/uploads/${p.file}` : p.src
      })),
      petState: room.petState,
      wishes: room.wishes || [],
      events: room.events || [],
      moods: room.moods || []
    };

    socket.emit('room-data', roomData);
  });

  socket.on('milestone-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    room.milestones.push(data);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('milestone-new', data);
  });

  socket.on('milestone-remove', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    room.milestones = room.milestones.filter(m => m.id !== data.id);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('milestone-delete', data);
  });

  socket.on('photo-upload', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);

    const matches = data.src && data.src.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const filename = `${data.id}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      const buffer = Buffer.from(matches[2], 'base64');
      fs.writeFileSync(filepath, buffer);

      const photoEntry = { id: data.id, by: data.by, time: data.time, file: filename };
      room.photos.push(photoEntry);
      saveRoom(roomKey, room);

      socket.to(roomKey).emit('photo-new', { ...photoEntry, src: `/uploads/${filename}` });
    } else {
      room.photos.push({ id: data.id, by: data.by, time: data.time, file: data.file });
      saveRoom(roomKey, room);
    }
  });

  socket.on('note-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    room.notes.push(data);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('note-new', data);
  });

  socket.on('note-remove', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    room.notes = room.notes.filter(n => n.id !== data.id);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('note-delete', data);
  });

  socket.on('pet-action', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    room.petState = data.state;
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('pet-action', data);
  });

  socket.on('wish-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    if (!room.wishes) room.wishes = [];
    room.wishes.push(data);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('wish-new', data);
  });

  socket.on('wish-toggle', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    if (!room.wishes) room.wishes = [];
    const w = room.wishes.find(x => x.id === data.id);
    if (w) { w.done = data.done; saveRoom(roomKey, room); }
    socket.to(roomKey).emit('wish-toggle', data);
  });

  socket.on('wish-delete', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    if (!room.wishes) room.wishes = [];
    room.wishes = room.wishes.filter(x => x.id !== data.id);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('wish-delete', data);
  });

  socket.on('event-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    if (!room.events) room.events = [];
    room.events.push(data);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('event-new', data);
  });

  socket.on('event-delete', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    if (!room.events) room.events = [];
    room.events = room.events.filter(x => x.id !== data.id);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('event-delete', data);
  });

  socket.on('mood-update', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    const room = ensureRoom(roomKey);
    if (!room.moods) room.moods = [];
    // Keep only the latest mood per user
    room.moods = room.moods.filter(m => m.by !== data.by);
    room.moods.unshift({ value: data.value, by: data.by, time: new Date().toLocaleString('zh-CN') });
    if (room.moods.length > 50) room.moods = room.moods.slice(0, 50);
    saveRoom(roomKey, room);
    socket.to(roomKey).emit('mood-update', data);
  });

  socket.on('disconnect', () => {
    const user = socket.data;
    if (user && user.name) {
      delete onlineUsers[user.name];
      console.log(`Disconnected: ${user.name}`);
    }
  });
});

// Get local IP for LAN access
function getLocalIP() {
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Our Space server running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  LAN:     http://${localIP}:${PORT}`);
  if (process.env.RENDER || process.env.RAILWAY || process.env.FLY_REGION) {
    console.log(`  Cloud:    https://${process.env.RENDER_EXTERNAL_HOSTNAME || process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.fly.dev'}`);
  }
  console.log(`  Data stored in: ${DATA_DIR}`);
  console.log(`  Photos stored in: ${UPLOADS_DIR}\n`);
});
