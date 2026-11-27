'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridukaan-test-'));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const server = spawn(process.execPath, ['--experimental-sqlite', path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: tmp },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let errors = '';
  server.stderr.on('data', chunk => { errors += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start: ' + errors)), 10000);
      server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
      server.once('exit', code => { clearTimeout(timeout); reject(new Error('Server exited: ' + code + ' ' + errors)); });
    });
    const url = 'http://127.0.0.1:' + port;
    async function request(route, method, data, cookie) {
      const response = await fetch(url + route, {
        method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: data ? JSON.stringify(data) : undefined
      });
      return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.json() };
    }
    assert.equal((await request('/api/shop', 'GET')).status, 401);
    let response = await request('/api/register', 'POST', { username: 'shopper', password: 'a long password' });
    assert.equal(response.status, 200);
    const cookie = response.cookie.split(';')[0];
    assert.equal((await request('/api/login', 'POST', { username: 'shopper', password: 'wrong password' })).status, 401);
    assert.equal((await request('/api/register', 'POST', { username: 'shopper', password: 'another password' })).status, 409);
    const shop = { items: [], entries: [], settings: {}, version: 1, nextId: 1 };
    response = await request('/api/shop', 'PUT', { revision: 0, snapshot: shop }, cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.revision, 1);
    const changed = { ...shop, entries: [{ id: 'e1', type: 'expense', amount: 10 }] };
    assert.equal((await request('/api/shop', 'PUT', { revision: 0, snapshot: changed }, cookie)).status, 409);
    response = await request('/api/shop', 'GET', null, cookie);
    assert.equal(response.body.revision, 1);
    assert.deepEqual(response.body.snapshot, shop);
    const another = await request('/api/register', 'POST', { username: 'other-shop', password: 'a different password' });
    const otherCookie = another.cookie.split(';')[0];
    response = await request('/api/shop', 'GET', null, otherCookie);
    assert.equal(response.body.snapshot, null);
    assert.equal(response.body.revision, 0);
    const crossOrigin = await fetch(url + '/api/shop', { headers: { Cookie: cookie, Origin: 'https://other.example' } });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await request('/api/logout', 'POST', null, cookie)).status, 200);
    assert.equal((await request('/api/shop', 'GET', null, cookie)).status, 401);
    console.log('Sync API tests passed.');
  } finally {
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
