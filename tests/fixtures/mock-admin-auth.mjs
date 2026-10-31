// Isolated Auth/PostgREST fixture for the admin login browser tests.
// It is never deployed and does not connect to a real Supabase project.
import http from 'node:http';

const id = 'c34675a2-65ac-4a4e-9d9d-9e3180ecaf9e';
const email = 'fixture-team@admin.terasbarber.invalid';
const password = 'fixture-only-password';
const user = {
  id, aud: 'authenticated', role: 'authenticated', email,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = () => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', aal: 'aal1', exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from('fixture-signature').toString('base64url')}`;

function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
    const body = await readJson(req);
    if (body.email !== email || body.password !== password) {
      return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    return send(res, 200, { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture-refresh-token', user });
  }
  if (url.pathname === '/auth/v1/user') {
    if (!req.headers.authorization?.startsWith('Bearer ')) return send(res, 401, { message: 'No session' });
    return send(res, 200, user);
  }
  if (url.pathname === '/rest/v1/profiles') return send(res, 200, [{ id, role: 'admin', full_name: 'Fixture Owner' }]);
  if (url.pathname === '/rest/v1/shop_settings') return send(res, 200, [{ timezone: 'Asia/Jakarta' }]);
  if (url.pathname === '/rest/v1/appointments' || url.pathname === '/rest/v1/services' || url.pathname === '/rest/v1/barbers') {
    return send(res, 200, [], { 'content-range': '*/0' });
  }
  return send(res, 404, { message: 'Unknown fixture endpoint' });
}).listen(3201, '127.0.0.1', () => console.log('Mock admin Auth ready on 3201'));
