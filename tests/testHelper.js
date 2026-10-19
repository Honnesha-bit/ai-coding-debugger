import { getDatabase, closeDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

// Enforce mock AI provider in test suites to prevent consuming live API quotas
config.AI_PROVIDER = 'mock';

export function setupTestDb() {
  closeDatabase();
  const db = getDatabase(':memory:');
  return db;
}

export function teardownTestDb() {
  closeDatabase();
}

/**
 * Lightweight HTTP test helper using fetch against an ephemeral server
 */
export async function startTestServer() {
  const db = setupTestDb();
  const app = createApp(db);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      const client = {
        baseUrl,
        cookieJar: {},

        async request(endpoint, options = {}) {
          const url = `${baseUrl}${endpoint}`;
          const headers = { ...(options.headers || {}) };

          // Attach cookies
          if (Object.keys(this.cookieJar).length > 0) {
            const cookieHeader = Object.entries(this.cookieJar)
              .map(([k, v]) => `${k}=${v}`)
              .join('; ');
            headers['Cookie'] = cookieHeader;
          }

          if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
          }

          const res = await fetch(url, { ...options, headers });

          // Save set-cookie headers into cookieJar
          const rawSetCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
          for (const sc of rawSetCookies) {
            const parts = sc.split(';')[0].split('=');
            if (parts.length >= 2) {
              const name = parts[0].trim();
              const val = parts.slice(1).join('=').trim();
              this.cookieJar[name] = val;
            }
          }

          return res;
        },

        async close() {
          return new Promise(res => server.close(res));
        }
      };

      resolve(client);
    });
  });
}
