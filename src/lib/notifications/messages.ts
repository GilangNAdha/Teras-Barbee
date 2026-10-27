import type { NotificationPayload } from '@/lib/notifications/types';

function formatLocal(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function rupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

// Plain text on purpose: no HTML/markdown escaping differences between providers.
export function buildNotificationMessage(payload: NotificationPayload): string {
  const when = formatLocal(payload.starts_at, payload.timezone || 'Asia/Jakarta');
  const code = payload.booking_code;
  const intro = `Terasbarber booking ${code}`;

  switch (payload.event) {
    case 'booking_created':
      return [
        `New booking request ${code}.`,
        `Customer: ${payload.customer_name}`,
        `Service: ${payload.service_name} (${payload.duration_minutes} min, ${rupiah(payload.price_idr)})`,
        `Requested time: ${when} (${payload.timezone || 'Asia/Jakarta'})`,
        'Status: pending. Review and confirm it in the admin dashboard.'
      ].join('\n');
    case 'booking_confirmed':
      return `${intro} is confirmed for ${when}. See you soon at Terasbarber.`;
    case 'booking_cancelled':
      return `${intro} has been cancelled. Contact Terasbarber if you did not request this change.`;
    case 'booking_rescheduled':
      return `${intro} has been rescheduled to ${when}. Manage it with your booking link if anything changes.`;
    case 'barber_assignment_changed':
      return `You have been assigned to booking ${code}: ${payload.customer_name}, ${payload.service_name} on ${when}.`;
    case 'appointment_reminder':
      return `Reminder: your Terasbarber appointment ${code} (${payload.service_name}) starts on ${when}. Please arrive a few minutes early.`;
    default:
      return `${intro}: status ${payload.status}.`;
  }
}
