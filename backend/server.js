/**
 * Our Space - 后端服务器
 * Node.js + Express + Socket.io
 * 纯中转模式：不做数据持久化，数据全部存在双方浏览器 localStorage
 * Render 重新部署不会丢失用户数据
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  },
  maxHttpBufferSize: 1e7 // 10MB for photo base64 sync
});

const PORT = process.env.PORT || 3000;

// Serve frontend (when deployed as a single app)
const frontendPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// ===== Pairing system (persists in memory only, resets on redeploy — acceptable) =====
const pairs = {};  // inviteCode -> { user1, user2, inviteCode }
const onlineUsers = {};  // name -> { socketId, inviteCode }

// ===== REST API for pairing =====
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
  if (!pair) {
    res.json({ success: false, msg: '邀请码无效' });
    return;
  }
  res.json({ success: true, partnerName: pair.user1 === myName ? pair.user2 : pair.user1 });
});

// ===== Socket.io (Pure Relay + In-memory cache for recovery) =====
// Room data cached in memory (not disk). Lost on redeploy, but at least one client
// typically reconnects and re-populates it. Acts as bridge when partner is offline.

const roomCache = {};  // roomKey -> { data, lastUpdate }

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // ----- Registration -----
  socket.on('register', (data) => {
    const { name, inviteCode } = data;
    onlineUsers[name] = { socketId: socket.id, inviteCode };
    socket.data = { name, inviteCode };

    const existingPair = Object.values(pairs).find(p => p.user1 === name || p.user2 === name);

    if (existingPair) {
      const partnerName = existingPair.user1 === name ? existingPair.user2 : existingPair.user1;
      socket.emit('pair-info', { partnerName, paired: true, inviteCode: existingPair.inviteCode });
    } else if (inviteCode) {
      pairs[inviteCode] = { user1: name, user2: null, inviteCode };
      socket.emit('pair-info', { paired: false, inviteCode });
    } else {
      socket.emit('pair-info', { paired: false });
    }

    console.log(`Registered: ${name}`);
  });

  // ----- Pairing -----
  socket.on('pair-request', (data) => {
    const { code, name } = data;
    const pendingPair = pairs[code];

    if (!pendingPair || pendingPair.user2) {
      socket.emit('pair-error', { msg: '邀请码无效，请确认对方是否已注册' });
      return;
    }

    const partnerName = pendingPair.user1;
    pendingPair.user2 = name;
    pairs[code] = { ...pendingPair };

    socket.emit('pair-success', { partnerName });
    const partnerOnline = onlineUsers[partnerName];
    if (partnerOnline) {
      io.to(partnerOnline.socketId).emit('paired-by', { partnerName: name });
    }

    console.log(`Paired: ${name} & ${partnerName}`);
  });

  // ----- Join Room -----
  socket.on('join-room', async (data) => {
    const { name, partnerName } = data;
    const roomKey = [name, partnerName].sort().join('__');
    socket.join(roomKey);
    socket.data.roomKey = roomKey;

    // If cached data exists and no partner is online, send cache as fallback
    const sockets = await io.in(roomKey).fetchSockets();
    const othersInRoom = sockets.filter(s => s.id !== socket.id);
    if (othersInRoom.length === 0 && roomCache[roomKey]) {
      socket.emit('sync-data', roomCache[roomKey].data);
    }
  });

  // ----- ALL data events: pure relay, no server storage -----

  socket.on('milestone-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('milestone-new', data);
  });

  socket.on('milestone-remove', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('milestone-delete', data);
  });

  // Photo: now sends base64 directly (no file storage)
  socket.on('photo-upload', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('photo-new', data);
  });

  socket.on('photo-delete', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('photo-delete', data);
  });

  socket.on('note-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('note-new', data);
  });

  socket.on('note-remove', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('note-delete', data);
  });

  socket.on('pet-action', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('pet-action', data);
  });

  socket.on('pet-sync', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('pet-sync', data);
  });

  socket.on('wish-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('wish-new', data);
  });

  socket.on('wish-toggle', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('wish-toggle', data);
  });

  socket.on('wish-delete', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('wish-delete', data);
  });

  socket.on('event-add', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('event-new', data);
  });

  socket.on('event-delete', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('event-delete', data);
  });

  socket.on('mood-update', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('mood-update', data);
  });

  // ----- Data sync between clients -----
  // When a client joins, they request the other client's localStorage data
  socket.on('sync-request', (data) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    socket.to(roomKey).emit('sync-request', data);
  });

  socket.on('sync-data', (incoming) => {
    const { roomKey } = socket.data || {};
    if (!roomKey) return;
    // Cache the latest data (in memory only — lost on server restart)
    roomCache[roomKey] = { data: incoming, lastUpdate: Date.now() };
    socket.to(roomKey).emit('sync-data', incoming);
  });

  // ----- Disconnect -----
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
  console.log(`  Mode:    Pure relay (data in clients' localStorage)\n`);
});
