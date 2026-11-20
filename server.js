const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db = {
  users: [],
  cars: [],
  activities: [],
  messages: [],
  sessions: [],
  supportOnline: true,
  supportName: 'Customer Support',
  admin: {
    username: 'admin',
    passwordHash: hashPassword('admin123')
  }
};

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, 'automarin-salt', 10000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      db = { ...db, ...loaded };
    }
    // Always refresh cars with working external images
    initializeCars();
    saveDB();
  } catch (e) {
    console.error('DB load error:', e);
    initializeCars();
  }
}

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function initializeCars() {
  const images = [
    'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800',
    'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=800',
    'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800',
    'https://images.unsplash.com/photo-1555215695-3004980adade?w=800',
    'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800',
    'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=800',
    'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800',
    'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800',
    'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800'
  ];
  const chineseModels = [
    'BYD Atto 3', 'BYD Seal', 'BYD Sealion 7', 'BYD Tang', 'MG ZS EV', 'MG4 EV',
    'Chery Omoda 5', 'Chery Tiggo 7', 'Geely Coolray', 'XPeng G6', 'NIO ET5'
  ];
  const americanModels = [
    'Ford Mustang Mach-E', 'Tesla Model 3', 'Tesla Model Y', 'Jeep Wrangler 4xe',
    'Chevrolet Equinox EV', 'Ford F-150 Lightning'
  ];
  db.cars = [];
  let id = 1;
  chineseModels.forEach((name, i) => {
    db.cars.push({
      id: id++, name, type: 'chinese',
      image: images[i % images.length],
      price: `€${(22000 + Math.floor(Math.random() * 18000)).toLocaleString()}`,
      details: 'Premium Chinese EV | Available at Automarin Alexandras',
      year: 2023 + (i % 3)
    });
  });
  americanModels.forEach((name, i) => {
    db.cars.push({
      id: id++, name, type: 'american',
      image: images[(i + 3) % images.length],
      price: `€${(35000 + Math.floor(Math.random() * 25000)).toLocaleString()}`,
      details: 'Iconic American performance & EV | Automarin collaboration',
      year: 2023 + (i % 3)
    });
  });
  for (let i = 0; i < 12; i++) {
    db.cars.push({
      id: id++,
      name: i % 2 === 0 ? `Chinese Model ${i+1}` : `American Model ${i+1}`,
      type: i % 2 === 0 ? 'chinese' : 'american',
      image: images[i % images.length],
      price: `€${(20000 + Math.floor(Math.random() * 30000)).toLocaleString()}`,
      details: 'Featured in the Automarin World Cars collection',
      year: 2024
    });
  }
}

const STAGES = {
  1: { name: 'Text Reviews', required: 30, reward: 50 },
  2: { name: 'Star Ratings', required: 20, reward: 100 },
  3: { name: 'Preferences', required: 15, reward: 150 },
  4: { name: 'Buying Intent Survey', required: 1, reward: 200 },
  5: { name: 'Final Verification', required: 1, reward: 50 },
  6: { name: 'VIP Members', required: 1, reward: null }
};

const rateLimits = new Map();
function checkRateLimit(key, max = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  let entry = rateLimits.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) entry = { count: 0, reset: now + windowMs };
  entry.count++;
  rateLimits.set(key, entry);
  return entry.count <= max;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getUserFromToken(token) {
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token);
  if (!session) return null;
  return db.users.find(u => u.id === session.userId);
}

function createSession(userId) {
  const token = generateToken();
  db.sessions.push({ token, userId, created: Date.now() });
  saveDB();
  return token;
}

function destroySession(token) {
  db.sessions = db.sessions.filter(s => s.token !== token);
  saveDB();
}

function sendVerificationEmail(email, token, name) {
  const apiKey = process.env.BREVO_API_KEY || 'b32d15bc0898c7ffc84cdeb4e0df9f5f56c162507169240685108b446d0f73e1-sbC3qkusXJw4SpZb';
  const senderEmail = process.env.SENDER_EMAIL || 'applesg70@gmail.com';
  const siteUrl = process.env.SITE_URL || 'https://new-auto-t44g.onrender.com';
  const verifyLink = `${siteUrl}/api/verify-email?token=${token}`;

  const payload = {
    sender: { name: 'Automarin World Cars', email: senderEmail },
    to: [{ email, name: name || email }],
    subject: 'Verify your email – Automarin World Cars',
    htmlContent: `<p>Hello ${name || 'there'},</p><p>Please verify your email to activate your account:</p><p><a href="${verifyLink}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Verify Email</a></p><p>${verifyLink}</p>`
  };

  const options = {
    hostname: 'api.brevo.com',
    path: '/v3/smtp/email',
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }
  };

  const reqMail = https.request(options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log(res.statusCode < 300 ? `Email sent to ${email}` : `Email failed: ${res.statusCode} ${data}`));
  });
  reqMail.on('error', e => console.error('Email error:', e.message));
  reqMail.write(JSON.stringify(payload));
  reqMail.end();
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  let cleanUrl = (req.url || '/').split('?')[0];
  if (cleanUrl === '/' || cleanUrl === '') cleanUrl = '/index.html';
  if (cleanUrl === '/admin' || cleanUrl === '/admin/') cleanUrl = '/admin.html';

  const candidates = [
    path.join(PUBLIC_DIR, cleanUrl),
    path.join(__dirname, 'public', cleanUrl),
    path.join(__dirname, cleanUrl.replace(/^\//, '')),
    path.join(PUBLIC_DIR, 'index.html'),
    path.join(__dirname, 'index.html')
  ];

  if (cleanUrl.startsWith('/uploads/')) {
    candidates.unshift(path.join(__dirname, cleanUrl));
  }

  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  console.log('404 for:', cleanUrl, 'tried:', candidates);
  res.writeHead(404); res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if (method === 'GET' && !pathname.startsWith('/api')) {
    return serveStatic(req, res);
  }

  try {
    const body = await parseBody(req);
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const currentUser = getUserFromToken(token);
    const isAdmin = token && token.startsWith('admin-');

    // Register
    if (pathname === '/api/register' && method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      if (!checkRateLimit('reg-' + ip, 5, 3600000)) return sendJSON(res, 429, { error: 'Too many attempts' });
      const { username, name, email, password, phone } = body;
      if (!username || !email || !password || !phone) return sendJSON(res, 400, { error: 'All fields required' });
      if (db.users.find(u => u.email === email || u.username === username)) return sendJSON(res, 400, { error: 'Already registered' });

      const user = {
        id: crypto.randomUUID(),
        username, name: name || username, email, phone,
        passwordHash: hashPassword(password),
        approved: false, emailVerified: false,
        verificationToken: generateToken(),
        kycVerified: false, kycDocument: null,
        stage: 1,
        stageProgress: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        isVIP: false, earnings: 0, pendingRewards: [],
        wallet: null, restricted: false, restrictionMessage: '',
        passwordResetRequest: null,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      db.users.push(user);
      saveDB();
      sendVerificationEmail(email, user.verificationToken, name || username);
      return sendJSON(res, 201, { message: 'Registration submitted. Check your email to verify. Admin must also approve.' });
    }

    // Verify email
    if (pathname === '/api/verify-email' && method === 'GET') {
      const user = db.users.find(u => u.verificationToken === parsed.query.token);
      if (!user) return sendJSON(res, 400, { error: 'Invalid token' });
      user.emailVerified = true;
      user.verificationToken = null;
      saveDB();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Email verified successfully!</h2><p>You can now log in after admin approval.</p><a href="/">Go to site</a>');
      return;
    }

    // Login
    if (pathname === '/api/login' && method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      if (!checkRateLimit('login-' + ip, 10, 900000)) return sendJSON(res, 429, { error: 'Too many login attempts' });
      const { email, password, username } = body;
      const user = db.users.find(u => u.email === (email || username) || u.username === (email || username));
      if (!user || !verifyPassword(password, user.passwordHash)) return sendJSON(res, 401, { error: 'Invalid credentials' });
      if (!user.emailVerified) return sendJSON(res, 403, { error: 'Please verify your email first' });
      if (!user.approved) return sendJSON(res, 403, { error: 'Pending admin approval' });
      const newToken = createSession(user.id);
      user.lastActivity = new Date().toISOString();
      saveDB();
      return sendJSON(res, 200, {
        token: newToken,
        user: {
          id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone,
          stage: user.stage, stageProgress: user.stageProgress, earnings: user.earnings,
          pendingRewards: user.pendingRewards, kycVerified: user.kycVerified, isVIP: user.isVIP,
          restricted: user.restricted, restrictionMessage: user.restrictionMessage
        }
      });
    }

    if (pathname === '/api/logout' && method === 'POST') {
      if (token) destroySession(token);
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/me' && method === 'GET') {
      if (!currentUser) return sendJSON(res, 401, { error: 'Unauthorized' });
      return sendJSON(res, 200, { user: currentUser });
    }

    // Cars
    if (pathname === '/api/cars' && method === 'GET') {
      const offset = parseInt(parsed.query.offset) || 0;
      const limit = parseInt(parsed.query.limit) || 8;
      const cars = db.cars.slice(offset, offset + limit);
      return sendJSON(res, 200, { cars, hasMore: offset + limit < db.cars.length });
    }

    // Stage actions
    if (pathname === '/api/stage/1/review' && method === 'POST') {
      if (!currentUser || currentUser.restricted) return sendJSON(res, 403, { error: 'Not allowed' });
      if (currentUser.stage !== 1) return sendJSON(res, 400, { error: 'Wrong stage' });
      currentUser.stageProgress[1] = (currentUser.stageProgress[1] || 0) + 1;
      if (currentUser.stageProgress[1] >= STAGES[1].required) {
        currentUser.pendingRewards.push({ stage: 1, amount: STAGES[1].reward, status: 'pending' });
      }
      currentUser.lastActivity = new Date().toISOString();
      saveDB();
      return sendJSON(res, 200, { success: true, progress: currentUser.stageProgress[1] });
    }

    if (pathname === '/api/stage/2/rate' && method === 'POST') {
      if (!currentUser || currentUser.restricted || currentUser.stage !== 2) return sendJSON(res, 403, { error: 'Not allowed' });
      currentUser.stageProgress[2] = (currentUser.stageProgress[2] || 0) + 1;
      if (currentUser.stageProgress[2] >= STAGES[2].required) {
        currentUser.pendingRewards.push({ stage: 2, amount: STAGES[2].reward, status: 'pending' });
      }
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    // Advance stage
    if (pathname === '/api/stage/advance' && method === 'POST') {
      if (!currentUser || currentUser.restricted) return sendJSON(res, 403, { error: 'Not allowed' });
      const stage = currentUser.stage;
      const prog = currentUser.stageProgress[stage] || 0;
      if (prog < (STAGES[stage]?.required || 999)) return sendJSON(res, 400, { error: 'Stage not complete' });
      if (stage < 6) currentUser.stage = stage + 1;
      saveDB();
      return sendJSON(res, 200, { stage: currentUser.stage });
    }

    // Chat
    if (pathname === '/api/chat/send' && method === 'POST') {
      if (!currentUser) return sendJSON(res, 401, { error: 'Login required' });
      const { message } = body;
      if (!message) return sendJSON(res, 400, { error: 'Message required' });
      db.messages.push({
        id: crypto.randomUUID(),
        userId: currentUser.id,
        userName: currentUser.name,
        message,
        from: 'user',
        time: new Date().toISOString()
      });
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/chat/messages' && method === 'GET') {
      if (!currentUser) return sendJSON(res, 401, { error: 'Unauthorized' });
      const msgs = db.messages.filter(m => m.userId === currentUser.id).slice(-50);
      return sendJSON(res, 200, { messages: msgs });
    }

    if (pathname === '/api/chat/upload' && method === 'POST') {
      if (!currentUser) return sendJSON(res, 401, { error: 'Unauthorized' });
      const { filename, data, message } = body;
      if (!filename || !data) return sendJSON(res, 400, { error: 'File required' });
      const safeName = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
      fs.writeFileSync(path.join(UPLOAD_DIR, safeName), Buffer.from(data, 'base64'));
      db.messages.push({
        id: crypto.randomUUID(),
        userId: currentUser.id,
        userName: currentUser.name,
        message: message || `File: ${filename}`,
        from: 'user',
        file: `/uploads/${safeName}`,
        time: new Date().toISOString()
      });
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    // Withdraw
    if (pathname === '/api/withdraw' && method === 'POST') {
      if (!currentUser) return sendJSON(res, 401, { error: 'Unauthorized' });
      if (!currentUser.kycVerified) return sendJSON(res, 403, { error: 'KYC required' });
      const { stage, wallet } = body;
      currentUser.wallet = wallet;
      const reward = currentUser.pendingRewards.find(r => r.stage === parseInt(stage) && r.status === 'pending');
      if (reward) reward.wallet = wallet;
      saveDB();
      return sendJSON(res, 200, { success: true, message: 'Withdrawal requested. Contact support for first withdrawal.' });
    }

    if (pathname === '/api/kyc' && method === 'POST') {
      if (!currentUser) return sendJSON(res, 401, { error: 'Unauthorized' });
      currentUser.kycDocument = { ...body, submittedAt: new Date().toISOString(), status: 'pending' };
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    // Admin login
    if (pathname === '/api/admin/login' && method === 'POST') {
      const { username, password } = body;
      if (username === db.admin.username && verifyPassword(password, db.admin.passwordHash)) {
        const adminToken = 'admin-' + generateToken();
        return sendJSON(res, 200, { token: adminToken });
      }
      return sendJSON(res, 401, { error: 'Invalid admin credentials' });
    }

    if (pathname === '/api/admin/users' && method === 'GET') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      return sendJSON(res, 200, { users: db.users });
    }

    if (pathname === '/api/admin/user' && method === 'PUT') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      const user = db.users.find(u => u.id === body.id);
      if (!user) return sendJSON(res, 404, { error: 'Not found' });
      Object.assign(user, body);
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/restrict' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      const user = db.users.find(u => u.id === body.userId);
      if (!user) return sendJSON(res, 404, { error: 'Not found' });
      user.restricted = !!body.restricted;
      user.restrictionMessage = body.message || (body.restricted ? 'Your account has been Restricted. Contact customer support.' : '');
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/ban-delete' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      db.users = db.users.filter(u => u.id !== body.userId);
      db.sessions = db.sessions.filter(s => s.userId !== body.userId);
      db.messages = db.messages.filter(m => m.userId !== body.userId);
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/verify-email' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      const user = db.users.find(u => u.id === body.userId);
      if (user) { user.emailVerified = true; user.verificationToken = null; saveDB(); }
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/chat/messages' && method === 'GET') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      return sendJSON(res, 200, { messages: db.messages.slice().reverse().slice(0, 100) });
    }

    if (pathname === '/api/admin/chat/reply' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      const { userId, message, supportName } = body;
      const name = supportName || db.supportName;
      const alreadyJoined = db.messages.some(m => m.userId === userId && m.from === 'system');
      if (!alreadyJoined) {
        db.messages.push({
          id: crypto.randomUUID(), userId, userName: 'System',
          message: `${name} has joined the chat`, from: 'system', supportName: name,
          time: new Date().toISOString()
        });
      }
      db.messages.push({
        id: crypto.randomUUID(), userId, userName: 'Support',
        message, from: 'admin', supportName: name,
        time: new Date().toISOString()
      });
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/set-support-name' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      db.supportName = body.name || 'Customer Support';
      saveDB();
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/support-status' && method === 'GET') {
      return sendJSON(res, 200, { online: db.supportOnline });
    }

    if (pathname === '/api/admin/toggle-support' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      db.supportOnline = !db.supportOnline;
      saveDB();
      return sendJSON(res, 200, { online: db.supportOnline });
    }

    if (pathname === '/api/admin/change-password' && method === 'POST') {
      if (!isAdmin) return sendJSON(res, 401, { error: 'Admin only' });
      if (body.newPassword && body.newPassword.length >= 6) {
        db.admin.passwordHash = hashPassword(body.newPassword);
        saveDB();
      }
      return sendJSON(res, 200, { success: true });
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: 'Server error' });
  }
});

loadDB();
server.listen(PORT, () => {
  console.log(`Automarin World Cars running on port ${PORT}`);
  console.log(`Admin: admin / admin123`);
});
