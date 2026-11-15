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
  if (url.pathname === '/rest/v1/profiles') {
    const single = req.headers.accept?.includes('application/vnd.pgrst.object+json');
    const row = { id, role: 'admin', full_name: 'Fixture Owner' };
    return send(res, 200, single ? row : [row]);
  }
  if (url.pathname === '/rest/v1/shop_settings') {
    if (req.method === 'PATCH') return send(res, 200, []);
    const single = req.headers.accept?.includes('application/vnd.pgrst.object+json');
    const row = {
      id: 1,
      shop_name: 'Terasbarber',
      address: null,
      city: null,
      timezone: 'Asia/Jakarta',
      phone_whatsapp: null,
      instagram_url: null,
      booking_notice_minutes: 60,
      booking_horizon_days: 45,
      customer_cancellation_deadline_minutes: 120,
      customer_reschedule_deadline_minutes: 120
    };
    return send(res, 200, single ? row : [row]);
  }
  if (url.pathname === '/rest/v1/rpc/admin_update_shop_setup') {
    return send(res, 200, null);
  }
  if (url.pathname === '/rest/v1/rpc/admin_finance_summary') {
    return send(res, 200, [{ completed_revenue: 0, scheduled_value: 0, average_completed_ticket: 0, booking_count: 0, completed_count: 0, confirmed_count: 0, pending_count: 0, cancelled_count: 0, no_show_count: 0 }]);
  }
  if (
    url.pathname === '/rest/v1/appointments' ||
    url.pathname === '/rest/v1/services' ||
    url.pathname === '/rest/v1/barbers' ||
    url.pathname === '/rest/v1/shop_hours' ||
    url.pathname === '/rest/v1/gallery_images' ||
    url.pathname === '/rest/v1/barber_services' ||
    url.pathname === '/rest/v1/barber_contact_channels'
  ) {
    return send(res, 200, [], { 'content-range': '*/0' });
  }
  return send(res, 404, { message: 'Unknown fixture endpoint' });
}).listen(3201, '127.0.0.1', () => console.log('Mock admin Auth ready on 3201'));
