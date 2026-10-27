export type BookingSlot = { starts_at: string; barber_id: string; barber_name: string };

// A time can be available with multiple barbers, so the start timestamp alone is not a unique option key.
export function bookingSlotKey(slot: Pick<BookingSlot, 'starts_at' | 'barber_id'>) {
  return `${slot.starts_at}|${slot.barber_id}`;
}
