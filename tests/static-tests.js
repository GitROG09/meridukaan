'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridukaan-static-test-'));
  const script = path.join(__dirname, '..', 'server', 'server.js');
  const env = {
    ...process.env, HOST: '127.0.0.1', DATA_DIR: tmp, SERVE_STATIC: 'true',
    SECURE_COOKIES: 'true', REQUIRE_DATA_VOLUME: 'true'
  };
  delete env.RAILWAY_VOLUME_MOUNT_PATH;
  const noVolume = spawnSync(process.execPath, ['--experimental-sqlite', script], { env, encoding: 'utf8' });
  assert.notEqual(noVolume.status, 0);
  assert.match(noVolume.stderr, /Attach a Railway volume/);

  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const server = spawn(process.execPath, ['--experimental-sqlite', script], {
    env: { ...env, PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: tmp },
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
    for (const [asset, type] of [
      ['/', 'text/html'], ['/index.html', 'text/html'], ['/css/style.css', 'text/css'],
      ['/config.js', 'text/javascript'], ['/manifest.json', 'application/manifest+json'],
      ['/icon.svg', 'image/svg+xml'], ['/sw.js', 'text/javascript'],
      ['/js/calc.js', 'text/javascript'], ['/js/data.js', 'text/javascript'],
      ['/js/parser.js', 'text/javascript'], ['/js/sync.js', 'text/javascript'],
      ['/js/app.js', 'text/javascript']
    ]) {
      const response = await fetch(url + asset);
      assert.equal(response.status, 200, asset);
      assert.ok(response.headers.get('content-type').startsWith(type), asset);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.ok((await response.text()).length > 0, asset);
    }
    assert.equal((await fetch(url + '/', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(url + '/', { method: 'POST' })).status, 405);
    for (const blocked of ['/server/server.js', '/data/shops.sqlite', '/%2e%2e/server/server.js', '/missing']) {
      assert.equal((await fetch(url + blocked)).status, 404, blocked);
    }
    const api = await fetch(url + '/api/shop');
    assert.equal(api.status, 401);
    assert.equal(api.headers.get('cache-control'), 'no-store');
    const registration = await fetch(url + '/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-shop', password: 'a long password' })
    });
    assert.equal(registration.status, 200);
    assert.match(registration.headers.get('set-cookie'), /;\s*Secure/i);
    console.log('Static deployment tests passed.');
  } finally {
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
