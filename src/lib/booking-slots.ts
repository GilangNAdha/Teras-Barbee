export type BookingSlot = { starts_at: string; barber_id: string; barber_name: string };
export type BookingSlotAvailability = BookingSlot & { is_available: boolean };

export type GroupedBookingSlot = {
  starts_at: string;
  is_available: boolean;
  availableBarbers: number;
  slot: BookingSlotAvailability;
};

// A start time may be offered by several barbers. When there is no preference,
// show it once and consider it available if at least one eligible barber is free.
export function groupBookingSlots(slots: BookingSlotAvailability[]): GroupedBookingSlot[] {
  const groups = new Map<string, GroupedBookingSlot>();
  for (const slot of slots) {
    const current = groups.get(slot.starts_at);
    if (!current) {
      groups.set(slot.starts_at, { starts_at: slot.starts_at, is_available: slot.is_available, availableBarbers: slot.is_available ? 1 : 0, slot });
    } else if (slot.is_available) {
      if (!current.is_available) current.slot = slot;
      current.is_available = true;
      current.availableBarbers += 1;
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// A time can be available with multiple barbers, so the start timestamp alone is not a unique option key.
export function bookingSlotKey(slot: Pick<BookingSlot, 'starts_at' | 'barber_id'>) {
  return `${slot.starts_at}|${slot.barber_id}`;
}
