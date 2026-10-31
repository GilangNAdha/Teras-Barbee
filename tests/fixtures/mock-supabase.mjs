// Test-only PostgREST fixture. It is never imported by the application or seeded
// into Supabase; browser tests start it on localhost in an isolated process.
import http from 'node:http';

const ids = {
  cut: '11111111-1111-4111-8111-111111111111', texture: '22222222-2222-4222-8222-222222222222', beard: '33333333-3333-4333-8333-333333333333',
  adi: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bima: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};
const services = [
  { id: ids.cut, name: 'Classic cut', slug: 'classic-cut', description: 'A considered cut finished to your style.', category: 'HAIRCUT', duration_minutes: 45, price_idr: 45000, image_url: null, is_active: true, sort_order: 1 },
  { id: ids.texture, name: 'Textured cut', slug: 'textured-cut', description: 'Texture and detail for an easy finish.', category: 'HAIRCUT', duration_minutes: 45, price_idr: 50000, image_url: null, is_active: true, sort_order: 2 },
  { id: ids.beard, name: 'Beard trim', slug: 'beard-trim', description: 'Shape and tidy up your beard.', category: 'BEARD', duration_minutes: 30, price_idr: 20000, image_url: null, is_active: true, sort_order: 3 }
];
const barbers = [
  { id: ids.adi, name: 'Adi Pratama', slug: 'adi', bio: 'Detail-focused barber.', specialties: ['Fades', 'Beards'], portrait_url: '/images/barber-hero.jpg', preview_cut_url: null, years_experience: 5, is_active: true, sort_order: 1 },
  { id: ids.bima, name: 'Bima Putra', slug: 'bima', bio: 'Classic cuts.', specialties: ['Classic cuts'], portrait_url: null, preview_cut_url: null, years_experience: 3, is_active: true, sort_order: 2 }
];
const assignments = [
  ...[ids.cut, ids.texture, ids.beard].map(service_id => ({ barber_id: ids.adi, service_id })),
  ...[ids.cut, ids.texture].map(service_id => ({ barber_id: ids.bima, service_id }))
];
const settings = { id: 1, shop_name: 'Terasbarber', address: null, city: null, timezone: 'Asia/Jakarta', phone_whatsapp: null, instagram_url: null, opening_hours: {}, booking_notice_minutes: 0, booking_horizon_days: 45, customer_cancellation_deadline_minutes: 120, customer_reschedule_deadline_minutes: 120 };
const hours = Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, opens_at: '09:00:00', closes_at: '18:00:00', is_closed: false }));
const requests = new Map();

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function addDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function eligible(serviceIds, barberId) {
  return barbers.filter(barber => (!barberId || barber.id === barberId) && serviceIds.every(service => assignments.some(item => item.barber_id === barber.id && item.service_id === service)));
}
function slots(date, serviceIds, barberId) {
  return eligible(serviceIds, barberId).flatMap(barber => ['09:00', '09:30', '10:00', '10:30'].map(time => ({
    starts_at: new Date(`${date}T${time}:00+07:00`).toISOString(), barber_id: barber.id, barber_name: barber.name,
    is_available: time !== '09:30'
  })));
}
function send(res, status, data) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); }
async function readJson(req) { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  if (url.pathname.startsWith('/auth/')) return send(res, 401, { message: 'No session' });
  if (req.method === 'GET') {
    if (url.pathname === '/rest/v1/services') return send(res, 200, services);
    if (url.pathname === '/rest/v1/barbers') return send(res, 200, barbers);
    if (url.pathname === '/rest/v1/barber_services') return send(res, 200, assignments);
    if (url.pathname === '/rest/v1/shop_hours') return send(res, 200, hours);
    if (url.pathname === '/rest/v1/shop_settings') return send(res, 200, [settings]);
    if (url.pathname === '/rest/v1/gallery_images' || url.pathname === '/rest/v1/barber_contact_channels') return send(res, 200, []);
    if (url.pathname === '/rest/v1/appointments') return send(res, 200, [{ barber_id: ids.adi }]);
  }
  if (req.method === 'POST') {
    const body = await readJson(req);
    if (url.pathname === '/rest/v1/rpc/get_booking_calendar') {
      const dates = [];
      for (let date = body.p_from; date <= body.p_to; date = addDays(date, 1)) dates.push({ booking_date: date, is_available: date >= today() && date <= addDays(today(), 45) && date !== addDays(today(), 2) && eligible(body.p_service_ids, body.p_barber_id).length > 0 });
      return send(res, 200, dates);
    }
    if (url.pathname === '/rest/v1/rpc/get_booking_slots') return send(res, 200, slots(body.p_date, body.p_service_ids, body.p_barber_id));
    if (url.pathname === '/rest/v1/rpc/create_booking_request') {
      if (!requests.has(body.p_request_id)) {
        const selected = services.filter(service => body.p_service_ids.includes(service.id));
        const barber = eligible(body.p_service_ids, body.p_barber_id)[0];
        requests.set(body.p_request_id, { appointment_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', booking_code: 'TEST123456', barber_name: barber.name, service_name: selected.map(service => service.name).join(' + '), starts_at: body.p_starts_at, price_idr: selected.reduce((sum, item) => sum + item.price_idr, 0), duration_minutes: selected.reduce((sum, item) => sum + item.duration_minutes, 0), booking_status: 'pending' });
      }
      return send(res, 200, [requests.get(body.p_request_id)]);
    }
  }
  console.error('Unexpected mock request:', req.method, url.pathname, url.search);
  return send(res, 404, { message: 'Unknown test endpoint' });
}).listen(3101, '127.0.0.1', () => console.log('Mock Supabase ready on 3101'));
