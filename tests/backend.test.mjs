import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../dist/app.js';
import { validateContact, fieldLimits } from '../dist/validation.js';
import { memoryLimiter, createRateLimiter } from '../dist/rateLimit.js';
import { createEmailSender } from '../dist/sendEmail.js';

const valid = { name: 'Jan Kowalski', localization: 'Wroclaw', contact: 'jan@example.com', message: 'Prosze o wycene', preferable: '' };
async function api(t, options = {}) {
  const sent = [];
  const app = createApp({ env: { NODE_ENV: 'test' }, sender: async body => { sent.push(body); }, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { sent, url, post: (body, headers = {}) => fetch(`${url}/send-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}

test('valid payload is trimmed, optional preference omitted, only known fields forwarded', async t => {
  const { post, sent } = await api(t);
  const input = { ...valid, name: ' Jan Kowalski ', extra: 'discard' }; delete input.preferable;
  const response = await post(input);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(sent, [valid]);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

for (const field of Object.keys(fieldLimits)) {
  test(`${field}: types and limits are enforced before sending`, async t => {
    const { post, sent } = await api(t);
    for (const value of [null, 123, true, {}, [], ['text'], 'x'.repeat(fieldLimits[field] + 1), ...(field === 'preferable' ? [] : ['', '  ', undefined])]) {
      const response = await post({ ...valid, [field]: value });
      assert.equal(response.status, 400, `${field}: ${JSON.stringify(value)}`);
      assert.equal((await response.json()).field, field);
    }
    assert.equal(sent.length, 0);
    assert.equal((await post({ ...valid, [field]: 'x'.repeat(fieldLimits[field]) })).status, 200);
  });
}

test('body shape, invalid JSON, wrong content type and size errors are JSON, never send', async t => {
  const { post, sent, url } = await api(t);
  for (const body of [null, [], 'text', 123, {}]) assert.equal((await post(body)).status, 400);
  for (const [body, type, status] of [['{', 'application/json', 400], [JSON.stringify(valid), 'text/plain', 415], [JSON.stringify({ ...valid, message: 'x'.repeat(17000) }), 'application/json', 413]]) {
    const response = await fetch(`${url}/send-email`, { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal(response.status, status); assert.equal((await response.json()).ok, false);
  }
  const empty = await fetch(`${url}/send-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  assert.equal(empty.status, 400); assert.equal(sent.length, 0);
});

test('CORS supports both public domains, blocks unknown origins and production localhost', async t => {
  const { post, sent, url } = await api(t, { env: { NODE_ENV: 'production' }, limiter: memoryLimiter() });
  for (const origin of ['https://wioryleca-meblenawymiar.pl', 'https://www.wioryleca-meblenawymiar.pl']) {
    const response = await post(valid, { Origin: origin });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), origin);
    const preflight = await fetch(`${url}/send-email`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(preflight.status, 204);
  }
  for (const origin of ['https://attacker.example', 'null', 'http://localhost:5173', 'https://wioryleca-meblenawymiar.pl.attacker.example']) assert.equal((await post(valid, { Origin: origin })).status, 403);
  assert.equal(sent.length, 2);
});

test('local preview origin is accepted only in development', async t => {
  const { post } = await api(t);
  assert.equal((await post(valid, { Origin: 'http://127.0.0.1:5173' })).status, 200);
  assert.equal((await post(valid, { Origin: 'http://localhost:5173.attacker.example' })).status, 403);
});

test('IP quota returns 429 and Retry-After, ignores spoofed forwarded headers locally', async t => {
  const { post, sent } = await api(t);
  for (let i = 0; i < 5; i++) assert.equal((await post(valid)).status, 200);
  const denied = await post(valid, { 'X-Forwarded-For': '203.0.113.1', 'X-Vercel-Forwarded-For': '203.0.113.2' });
  assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('retry-after')) > 0); assert.equal(sent.length, 5);
});

test('Vercel uses platform IP and rejects missing or malformed platform headers', async t => {
  const ips = [];
  const { post } = await api(t, { env: { VERCEL: '1' }, limiter: async ip => { ips.push(ip); return { allowed: true, retryAfter: 0 }; } });
  assert.equal((await post(valid)).status, 503);
  assert.equal((await post(valid, { 'X-Vercel-Forwarded-For': 'bad-ip' })).status, 503);
  assert.equal((await post(valid, { 'X-Vercel-Forwarded-For': '203.0.113.9', 'X-Forwarded-For': '198.51.100.1' })).status, 200);
  assert.deepEqual(ips, ['203.0.113.9']);
});

test('production without shared quota configuration fails closed without sending', async t => {
  const { post, sent } = await api(t, { env: { NODE_ENV: 'production' } });
  assert.equal((await post(valid)).status, 503); assert.equal(sent.length, 0);
});

test('store failure and mail failure return distinct safe errors', async t => {
  const unavailable = await api(t, { limiter: async () => { throw Error('private token'); } });
  assert.equal((await unavailable.post(valid)).status, 503); assert.equal(unavailable.sent.length, 0);
  const mailFailure = await api(t, { sender: async () => { throw Error('sensitive provider response'); } });
  const response = await mailFailure.post(valid);
  assert.equal(response.status, 502); assert.deepEqual(await response.json(), { ok: false, code: 'EMAIL_SEND_FAILED' });
});

test('memory quotas expire and global quota also limits different IPs', async () => {
  let time = 0; const limit = memoryLimiter(() => time);
  for (let i = 0; i < 5; i++) assert.equal((await limit('one')).allowed, true);
  assert.equal((await limit('one')).allowed, false);
  time = 900000; assert.equal((await limit('one')).allowed, true);
  for (let i = 0; i < 44; i++) assert.equal((await limit(`ip-${i}`)).allowed, true);
  assert.equal((await limit('new')).allowed, false);
  time = 3600000; assert.equal((await limit('new')).allowed, true);
});

test('shared store uses one atomic request, hashed IP and validates response', async () => {
  const env = { NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' };
  let request;
  const limiter = createRateLimiter(env, async (url, init) => { request = { url, init }; return Response.json({ result: [0, 120] }); });
  assert.deepEqual(await limiter('203.0.113.1'), { allowed: false, retryAfter: 120 });
  const command = JSON.parse(request.init.body);
  assert.equal(command[0], 'EVAL'); assert.equal(command[2], '2'); assert.equal(command.length, 9);
  assert.ok(!request.init.body.includes('203.0.113.1')); assert.equal(request.init.redirect, 'error');
  for (const data of [{ error: 'failed' }, {}, { result: [2, 0] }, { result: [0, -1] }, { result: [0, '120'] }]) await assert.rejects(createRateLimiter(env, async () => Response.json(data))('ip'));
  await assert.rejects(createRateLimiter(env, async () => new Response('', { status: 503 }))('ip'));
  await assert.rejects(createRateLimiter(env, async () => { throw Error('offline'); })('ip'));
});

test('mail escapes HTML, preserves newlines, includes text and email reply-to', async () => {
  let mail;
  const send = createEmailSender({ emails: { send: async payload => { mail = payload; return { data: { id: 'test-id' }, error: null }; } } });
  await send({ ...valid, message: '<script>alert("x")</script>\nsecond line & end' });
  assert.ok(!mail.html.includes('<script>')); assert.ok(mail.html.includes('&lt;script&gt;')); assert.ok(mail.html.includes('<br>second line &amp; end'));
  assert.ok(mail.text.includes('\nsecond line & end')); assert.equal(mail.replyTo, valid.contact); assert.equal(mail.to, 'wiory_leca@wp.pl');
  await send({ ...valid, contact: '+48 123 456 789' }); assert.equal(mail.replyTo, undefined);
  await send({ ...valid, contact: 'jan@example.com\r\nBcc: other@example.com' }); assert.equal(mail.replyTo, undefined);
});

test('mail service rejects missing config, provider rejection, empty response and transport failure', async () => {
  await assert.rejects(createEmailSender(null)(valid), /NOT_CONFIGURED/);
  for (const response of [{ data: null, error: { message: 'denied' } }, { data: null, error: null }, { data: { id: '' }, error: null }]) await assert.rejects(createEmailSender({ emails: { send: async () => response } })(valid), /SEND_FAILED/);
  await assert.rejects(createEmailSender({ emails: { send: async () => { throw Error('offline'); } } })(valid));
  let called = false;
  await assert.rejects(createEmailSender({ emails: { send: async () => { called = true; return { data: { id: 'id' }, error: null }; } } })({ ...valid, message: ' ' }));
  assert.equal(called, false);
});

test('health is liveness only and unknown routes return JSON', async t => {
  const { url } = await api(t);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.deepEqual(await (await fetch(`${url}/missing`)).json(), { ok: false, code: 'NOT_FOUND' });
});
