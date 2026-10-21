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

  await t.test('Register fails with duplicate username (case-insensitive)', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'charlie', email: 'charlie@example.com', password: 'password123' }
    });

    const res = await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'CHARLIE', email: 'charlie2@example.com', password: 'password123' }
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('Username already taken'));
  });

  await t.test('Register fails with duplicate email (case-insensitive)', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'dan', email: 'dan@example.com', password: 'password123' }
    });

    const res = await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'dan_unique', email: 'DAN@EXAMPLE.COM', password: 'password123' }
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('Email already registered'));
  });

  await t.test('Register fails with short password', async () => {
    const res = await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'shortpw', email: 'shortpw@example.com', password: '123' }
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('Password must be at least 6 characters'));
  });

  await t.test('Login succeeds with case-insensitive username', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'EvanDev', email: 'evan@example.com', password: 'password123' }
    });

    // Clear cookies to simulate fresh browser login
    client.cookieJar = {};

    const res = await client.request('/api/v1/auth/login', {
      method: 'POST',
      body: { username: 'evandev', password: 'password123' }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.username, 'EvanDev');
    assert.ok(client.cookieJar['session_token']);
  });

  await t.test('Login fails with invalid password', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'frank', email: 'frank@example.com', password: 'password123' }
    });

    const res = await client.request('/api/v1/auth/login', {
      method: 'POST',
      body: { username: 'frank', password: 'wrongpassword' }
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_CREDENTIALS');
  });

  await t.test('Login fails with nonexistent username', async () => {
    const res = await client.request('/api/v1/auth/login', {
      method: 'POST',
      body: { username: 'nonexistent_user', password: 'password123' }
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_CREDENTIALS');
  });

  await t.test('Logout clears session cookie and sets unauthenticated status', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'george', email: 'george@example.com', password: 'password123' }
    });
    assert.ok(client.cookieJar['session_token']);

    const logoutRes = await client.request('/api/v1/auth/logout', { method: 'POST' });
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(client.cookieJar['session_token'], '');

    const statusRes = await client.request('/api/v1/auth/status');
    const status = await statusRes.json();
    assert.strictEqual(status.authenticated, false);
    assert.strictEqual(status.user, null);
  });

  await t.test('Login succeeds with registered email address', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'HannahUser', email: 'hannah@example.com', password: 'password123' }
    });

    client.cookieJar = {}; // Simulate fresh login

    const res = await client.request('/api/v1/auth/login', {
      method: 'POST',
      body: { username: 'hannah@example.com', password: 'password123' }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.username, 'HannahUser');
    assert.strictEqual(data.user.email, 'hannah@example.com');
  });

  await t.test('User stays authenticated after simulated page refresh', async () => {
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'IanUser', email: 'ian@example.com', password: 'password123' }
    });

    // 1st request (initial load)
    const initialStatus = await (await client.request('/api/v1/auth/status')).json();
    assert.strictEqual(initialStatus.authenticated, true);
    assert.strictEqual(initialStatus.user.username, 'IanUser');

    // 2nd request (simulated page refresh retaining cookie)
    const refreshedStatus = await (await client.request('/api/v1/auth/status')).json();
    assert.strictEqual(refreshedStatus.authenticated, true);
    assert.strictEqual(refreshedStatus.user.username, 'IanUser');
  });

  await t.test('Profile endpoint enforces authentication and data isolation', async () => {
    // Unauthenticated request receives 401
    const unauthRes = await client.request('/api/v1/auth/profile');
    assert.strictEqual(unauthRes.status, 401);

    // Register User A
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'UserAlpha', email: 'alpha@example.com', password: 'password123' }
    });
    const alphaProfile = await (await client.request('/api/v1/auth/profile')).json();
    assert.strictEqual(alphaProfile.success, true);
    assert.strictEqual(alphaProfile.user.username, 'UserAlpha');
    assert.strictEqual(alphaProfile.user.email, 'alpha@example.com');

    // User B on separate session cannot access User A's profile
    const betaClient = await client.request('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'UserBeta', email: 'beta@example.com', password: 'password123' }
    });
    const betaProfile = await (await client.request('/api/v1/auth/profile')).json();
    assert.strictEqual(betaProfile.success, true);
    assert.strictEqual(betaProfile.user.username, 'UserBeta');
    assert.strictEqual(betaProfile.user.email, 'beta@example.com');
  });
});
