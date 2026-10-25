import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer } from '../server.mjs';

test('the local server exposes the app but refuses private paths and writes', async () => {
  const server = makeServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    for (const path of ['/package-lock.json', '/.env', '/tests/server.test.mjs', '/src/../../package.json', '/src/%2e%2e%5cpackage.json']) {
      assert.equal((await fetch(url + path)).status, 404, path);
    }
    assert.equal((await fetch(url, { method: 'POST', body: 'no writes' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
