'use client';

import { useState } from 'react';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ShopHourDayInput {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
}

interface DayState {
  closed: boolean;
  opensAt: string;
  closesAt: string;
}

export function ShopHoursFields({ initialHours }: { initialHours: ShopHourDayInput[] }) {
  const [schedule, setSchedule] = useState<DayState[]>(() => {
    const byDay = new Map(initialHours.map(item => [item.day_of_week, item]));
    return days.map((_, index) => {
      const row = byDay.get(index);
      return {
        closed: row?.is_closed ?? true,
        opensAt: row?.opens_at?.slice(0, 5) || '',
        closesAt: row?.closes_at?.slice(0, 5) || ''
      };
    });
  });

  function toggleClosed(index: number, closed: boolean) {
    setSchedule(current =>
      current.map((day, dayIndex) => {
        if (dayIndex !== index) return day;
        return {
          closed,
          opensAt: !closed && !day.opensAt ? '09:00' : day.opensAt,
          closesAt: !closed && !day.closesAt ? '21:00' : day.closesAt
        };
      })
    );
  }

  function updateTime(index: number, field: 'opensAt' | 'closesAt', value: string) {
    setSchedule(current =>
      current.map((day, dayIndex) => (dayIndex === index ? { ...day, [field]: value } : day))
    );
  }

  return (
    <div className="mt-5 space-y-2">
      {days.map((day, index) => {
        const current = schedule[index];
        return (
          <div
            key={day}
            className="grid grid-cols-2 items-center gap-2 border-t border-black/10 py-2.5 sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <span className="text-xs font-semibold sm:order-1">{day}</span>
            <label className="flex items-center gap-1.5 justify-self-end text-[10px] sm:order-4 sm:justify-self-start">
              <input
                type="checkbox"
                name={`closed_${index}`}
                checked={current.closed}
                onChange={event => toggleClosed(index, event.target.checked)}
              />
              Closed
            </label>
            <input
              aria-label={`${day} opens`}
              className="w-full min-w-0 border border-black/20 bg-transparent p-2 text-xs disabled:opacity-45 sm:order-2"
              type="time"
              name={`open_${index}`}
              value={current.opensAt}
              onChange={event => updateTime(index, 'opensAt', event.target.value)}
              disabled={current.closed}
              required={!current.closed}
            />
            <input
              aria-label={`${day} closes`}
              className="w-full min-w-0 border border-black/20 bg-transparent p-2 text-xs disabled:opacity-45 sm:order-3"
              type="time"
              name={`close_${index}`}
              value={current.closesAt}
              onChange={event => updateTime(index, 'closesAt', event.target.value)}
              disabled={current.closed}
              required={!current.closed}
            />
          </div>
        );
      })}
    </div>
  );
}
