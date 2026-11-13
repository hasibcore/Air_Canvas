const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/edusite_test';
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '15m';
process.env.CORS_ORIGINS = 'https://app.example.com';
process.env.BCRYPT_ROUNDS = '10';
process.env.REQUIRE_HTTPS = 'false';
process.env.DB_SSL_MODE = 'disable';
process.env.DB_POOL_MAX = '5';
process.env.DB_STATEMENT_TIMEOUT_MS = '3000';

// Install in-memory DB stub into require cache before loading routes/server
const dbPath = require.resolve('../src/db');
const usersByEmail = new Map();
const usersById = new Map();
let nextUserId = 1;
let forceDbFailure = false;

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {},
    query: async (sql, params = []) => {
      if (forceDbFailure) {
        const err = new Error('Simulated PostgreSQL connection failure');
        err.code = 'ECONNREFUSED';
        throw err;
      }

      if (sql.startsWith('SELECT 1')) {
        return { rowCount: 1, rows: [{ '?column?': 1 }] };
      }

      if (sql.includes('INSERT INTO app_users')) {
        const [email, fullName, passwordHash] = params;
        if (usersByEmail.has(email)) {
          const dupErr = new Error('duplicate key value violates unique constraint');
          dupErr.code = '23505';
          throw dupErr;
        }
        const row = {
          id: nextUserId++,
          email,
          full_name: fullName,
          password_hash: passwordHash,
          created_at: new Date().toISOString(),
        };
        usersByEmail.set(email, row);
        usersById.set(String(row.id), row);
        return {
          rowCount: 1,
          rows: [{ id: row.id, email: row.email, full_name: row.full_name, created_at: row.created_at }],
        };
      }

      if (sql.includes('FROM app_users WHERE email = $1')) {
        const user = usersByEmail.get(params[0]);
        return user ? { rowCount: 1, rows: [user] } : { rowCount: 0, rows: [] };
      }

      if (sql.includes('FROM app_users WHERE id = $1')) {
        const user = usersById.get(String(params[0]));
        if (!user) return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [{ id: user.id, email: user.email, full_name: user.full_name, created_at: user.created_at }],
        };
      }

      throw new Error(`Unhandled SQL in stub: ${sql}`);
    },
    closePool: async () => {},
  },
};

const { createApp } = require('../src/server');

describe('edusite_backend Auth, Security & Health Regression Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    usersByEmail.clear();
    usersById.clear();
    nextUserId = 1;
    forceDbFailure = false;
  });

  it('returns 200 on GET /health and validates DB readiness on GET /health/ready', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

    const readyRes = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readyRes.status, 200);
    const readyBody = await readyRes.json();
    assert.equal(readyBody.status, 'ready');
    assert.equal(readyBody.database, 'connected');

    forceDbFailure = true;
    const failRes = await fetch(`${baseUrl}/health/ready`);
    assert.equal(failRes.status, 503);
    const failBody = await failRes.json();
    assert.equal(failBody.status, 'unavailable');
    assert.equal(failBody.database, 'disconnected');
  });

  it('rejects disallowed CORS origins with 403 and allows configured origin', async () => {
    const badRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(badRes.status, 403);

    const goodRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://app.example.com' },
    });
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.headers.get('access-control-allow-origin'), 'https://app.example.com');
  });

  it('validates registration inputs, hashes passwords, and handles duplicate emails cleanly', async () => {
    const weakRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'short', fullName: 'Ada' }),
    });
    assert.equal(weakRes.status, 400);

    const malformedRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    assert.equal(malformedRes.status, 400);

    const okRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '  Alice@Example.com ',
        password: 'CorrectHorseBatteryStaple123!',
        fullName: 'Alice Lovelace',
      }),
    });
    assert.equal(okRes.status, 201);
    const created = await okRes.json();
    assert.equal(created.user.email, 'alice@example.com');
    assert.equal(created.user.password_hash, undefined);

    const stored = usersByEmail.get('alice@example.com');
    assert.ok(stored.password_hash.startsWith('$2'));

    const dupRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'CorrectHorseBatteryStaple123!',
        fullName: 'Alice Lovelace',
      }),
    });
    assert.equal(dupRes.status, 409);
  });

  it('issues HS256 JWT on login, enforces password check, and verifies alg pinning on /api/v1/me', async () => {
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@example.com',
        password: 'CorrectHorseBatteryStaple123!',
        fullName: 'Bob Builder',
      }),
    });

    const badPassRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@example.com',
        password: 'WrongPasswordButLongEnough123!',
      }),
    });
    assert.equal(badPassRes.status, 401);

    const unknownRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'missing-user@example.com',
        password: 'WrongPasswordButLongEnough123!',
      }),
    });
    assert.equal(unknownRes.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@example.com',
        password: 'CorrectHorseBatteryStaple123!',
      }),
    });
    assert.equal(loginRes.status, 200);
    const { token } = await loginRes.json();
    assert.ok(typeof token === 'string' && token.length > 20);

    // Valid token -> 200
    const meRes = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.email, 'bob@example.com');

    // Forged alg=none token -> 401
    const noneToken = jwt.sign({ email: 'bob@example.com', sub: '1' }, null, { algorithm: 'none' });
    const noneRes = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { Authorization: `Bearer ${noneToken}` },
    });
    assert.equal(noneRes.status, 401);

    // Wrong algorithm HS384 even with same secret -> 401 (pinned HS256)
    const hs384Token = jwt.sign({ email: 'bob@example.com', sub: '1' }, process.env.JWT_SECRET, {
      algorithm: 'HS384',
    });
    const hs384Res = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { Authorization: `Bearer ${hs384Token}` },
    });
    assert.equal(hs384Res.status, 401);
  });
});
