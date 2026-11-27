'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const directory = process.env.DATA_DIR || path.join(__dirname, 'data');
if (process.env.REQUIRE_DATA_VOLUME === 'true' &&
    (!process.env.RAILWAY_VOLUME_MOUNT_PATH ||
     path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH) !== path.resolve(directory))) {
  throw new Error('Attach a Railway volume at DATA_DIR before starting the service.');
}
fs.mkdirSync(directory, { recursive: true });
const database = new DatabaseSync(path.join(directory, 'shops.sqlite'));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS accounts (
    username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0, snapshot TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL
  );
`);

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;
const attempts = new Map();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const passwordHash = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
const publicDirectory = path.join(__dirname, '..', 'public');
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/css/style.css': ['css/style.css', 'text/css; charset=utf-8'],
  '/config.js': ['config.js', 'text/javascript; charset=utf-8'],
  '/manifest.json': ['manifest.json', 'application/manifest+json; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/js/calc.js': ['js/calc.js', 'text/javascript; charset=utf-8'],
  '/js/data.js': ['js/data.js', 'text/javascript; charset=utf-8'],
  '/js/parser.js': ['js/parser.js', 'text/javascript; charset=utf-8'],
  '/js/sync.js': ['js/sync.js', 'text/javascript; charset=utf-8'],
  '/js/app.js': ['js/app.js', 'text/javascript; charset=utf-8']
};

function serveStatic(req, res, route) {
  const file = Object.hasOwn(staticFiles, route) && staticFiles[route];
  if (!file) return respond(res, 404, { error: 'Not found.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return respond(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  }
  fs.readFile(path.join(publicDirectory, file[0]), (error, contents) => {
    if (error) {
      console.error('Static file error:', error);
      return respond(res, 500, { error: 'Unable to load the app.' });
    }
    res.writeHead(200, {
      'Content-Type': file[1],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : contents);
  });
}

function respond(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function session(req) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith('meridukaan_session='));
  if (!cookie) return null;
  const token = cookie.slice('meridukaan_session='.length);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return database.prepare('SELECT username FROM sessions WHERE token_hash = ? AND expires > ?')
    .get(hash(token), Date.now());
}

function setSession(res, username) {
  const token = crypto.randomBytes(32).toString('hex');
  database.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
  database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), username, Date.now() + SESSION_MS);
  const secure = process.env.SECURE_COOKIES === 'true' ? '; Secure' : '';
  return { 'Set-Cookie': `meridukaan_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_MS / 1000}${secure}` };
}

function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
}

function rateLimited(req) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter(time => time > now - 60 * 1000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 10;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!sameOrigin(req)) return respond(res, 403, { error: 'Cross-origin requests are not allowed.' });
    const route = new URL(req.url, 'http://localhost').pathname;
    if (process.env.SERVE_STATIC === 'true' && route !== '/api' && !route.startsWith('/api/')) {
      return serveStatic(req, res, route);
    }
    if (req.method === 'POST' && (route === '/api/register' || route === '/api/login')) {
      if (rateLimited(req)) return respond(res, 429, { error: 'Too many attempts. Try again later.' });
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return respond(res, 415, { error: 'JSON required.' });
      const body = await readBody(req);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username) || password.length < 10 || password.length > 128) {
        return respond(res, 400, { error: 'Use a 3–32 character username and a password of 10–128 characters.' });
      }
      const account = database.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
      if (route === '/api/register') {
        if (account) return respond(res, 409, { error: 'Username already exists.' });
        const salt = crypto.randomBytes(16).toString('hex');
        database.prepare('INSERT INTO accounts (username, salt, password_hash) VALUES (?, ?, ?)')
          .run(username, salt, passwordHash(password, salt));
      } else {
        const candidate = passwordHash(password, account ? account.salt : '00000000000000000000000000000000');
        if (!account || !crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(account.password_hash, 'hex'))) {
          return respond(res, 401, { error: 'Incorrect username or password.' });
        }
      }
      return respond(res, 200, { username }, setSession(res, username));
    }

    const user = session(req);
    if (!user) return respond(res, 401, { error: 'Sign in to sync.' });
    if (req.method === 'POST' && route === '/api/logout') {
      const token = (req.headers.cookie || '').split(';').map(part => part.trim())
        .find(part => part.startsWith('meridukaan_session=')).slice('meridukaan_session='.length);
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
      return respond(res, 200, { ok: true }, { 'Set-Cookie': 'meridukaan_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0' });
    }
    if (req.method === 'GET' && route === '/api/shop') {
      const row = database.prepare('SELECT revision, snapshot FROM accounts WHERE username = ?').get(user.username);
      return respond(res, 200, { username: user.username, revision: row.revision, snapshot: row.snapshot ? JSON.parse(row.snapshot) : null });
    }
    if (req.method === 'PUT' && route === '/api/shop') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return respond(res, 415, { error: 'JSON required.' });
      const body = await readBody(req);
      if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !body.snapshot ||
          !Array.isArray(body.snapshot.items) || !Array.isArray(body.snapshot.entries) ||
          !body.snapshot.settings || typeof body.snapshot.settings !== 'object') {
        return respond(res, 400, { error: 'Invalid shop data.' });
      }
      const update = database.prepare('UPDATE accounts SET snapshot = ?, revision = revision + 1 WHERE username = ? AND revision = ?')
        .run(JSON.stringify(body.snapshot), user.username, body.revision);
      if (update.changes === 0) return respond(res, 409, { error: 'The shop changed on another device.' });
      return respond(res, 200, { revision: body.revision + 1 });
    }
    return respond(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error('API error:', error);
    if (!res.headersSent && !res.destroyed) respond(res, 500, { error: 'Server error. Your local data is unchanged.' });
  }
});

server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log('MeriDukaan sync API is running.');
});
