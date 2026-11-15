import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  updateEq: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock('@/lib/auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({
  redirect: (path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }
}));

import { saveShopSettingsAction } from '@/app/admin/settings/actions';

function baseForm() {
  const form = new FormData();
  form.set('shop_name', 'Terasbarber');
  form.set('address', 'Jl. Sudirman 10');
  form.set('city', 'Padang');
  form.set('timezone', 'Asia/Jakarta');
  form.set('phone_whatsapp', '+62 812-3456-7890');
  form.set('instagram_url', 'https://instagram.com/terasbarber');
  form.set('booking_notice_minutes', '60');
  form.set('booking_horizon_days', '45');
  form.set('customer_cancellation_deadline_minutes', '120');
  form.set('customer_reschedule_deadline_minutes', '120');
  for (let day = 0; day < 7; day += 1) {
    if (day === 0) {
      form.set(`closed_${day}`, 'on');
    } else {
      form.set(`open_${day}`, '09:00:00');
      form.set(`close_${day}`, '21:00');
    }
  }
  return form;
}

describe('saveShopSettingsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.requireAdmin.mockResolvedValue({
      supabase: {
        rpc: mocks.rpc,
        from: () => ({ update: () => ({ eq: mocks.updateEq }) })
      }
    });
  });

  it('saves valid shop setup and normalizes HH:MM:SS time inputs', async () => {
    await expect(saveShopSettingsAction(baseForm())).rejects.toThrow('REDIRECT:/admin/settings?saved=1');
    expect(mocks.rpc).toHaveBeenCalledOnce();
    const [, payload] = mocks.rpc.mock.calls[0];
    expect(payload.p_hours[0]).toEqual({ day_of_week: 0, is_closed: true, opens_at: null, closes_at: null });
    expect(payload.p_hours[1]).toEqual({ day_of_week: 1, is_closed: false, opens_at: '09:00', closes_at: '21:00' });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 1);
  });

  it('rejects open days when closing is not after opening', async () => {
    const form = baseForm();
    form.set('open_1', '21:00');
    form.set('close_1', '09:00');
    await expect(saveShopSettingsAction(form)).rejects.toThrow('REDIRECT:/admin/settings?error=hours');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid IANA timezones', async () => {
    const form = baseForm();
    form.set('timezone', 'Not/A_Timezone');
    await expect(saveShopSettingsAction(form)).rejects.toThrow('REDIRECT:/admin/settings?error=timezone');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
