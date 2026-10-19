import test from 'node:test';
import assert from 'node:assert';
import { startTestServer } from '../testHelper.js';

test('Auth Integration Suite', async (t) => {
  let client;

  t.beforeEach(async () => {
    client = await startTestServer();
  });

  t.afterEach(async () => {
    if (client) await client.close();
  });

  await t.test('Register fails with duplicate username', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'alice', email: 'alice@example.com', password: 'password123' }
    });

    const res = await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'alice', email: 'different@example.com', password: 'password123' }
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('Username already taken'));
  });

  await t.test('Login rotates session token to prevent fixation', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'bob', email: 'bob@example.com', password: 'password123' }
    });
    const token1 = client.cookieJar['session_token'];

    // Log in again
    await client.request('/api/v1/auth/login', {
      method: 'POST',
      body: { username: 'bob', password: 'password123' }
    });
    const token2 = client.cookieJar['session_token'];

    assert.ok(token1);
    assert.ok(token2);
    assert.notStrictEqual(token1, token2, 'Session token should rotate upon login');
  });
});
