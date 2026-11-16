import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chargeMidtransQris,
  computeMidtransSignature,
  getMidtransBaseUrl,
  isAllowedMidtransQrUrl,
  mapMidtransPaymentState,
  verifyMidtransSignature
} from '@/lib/midtrans';

const serverKey = 'SB-Mid-server-test-key';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('midtrans signature', () => {
  it('builds the documented sha512 signature', () => {
    const expected = createHash('sha512').update(`TB-ABC-12320045000.00${serverKey}`).digest('hex');
    expect(computeMidtransSignature({ orderId: 'TB-ABC-123', statusCode: '200', grossAmount: '45000.00', serverKey })).toBe(expected);
  });

  it('accepts only the matching signature', () => {
    const signatureKey = computeMidtransSignature({ orderId: 'TB-ABC-123', statusCode: '200', grossAmount: '45000.00', serverKey });
    expect(verifyMidtransSignature({ orderId: 'TB-ABC-123', statusCode: '200', grossAmount: '45000.00', signatureKey, serverKey })).toBe(true);
    expect(verifyMidtransSignature({ orderId: 'TB-ABC-124', statusCode: '200', grossAmount: '45000.00', signatureKey, serverKey })).toBe(false);
    expect(verifyMidtransSignature({ orderId: 'TB-ABC-123', statusCode: '200', grossAmount: '45000.00', signatureKey: 'short', serverKey })).toBe(false);
  });

  it('refuses to verify without a configured server key', () => {
    expect(verifyMidtransSignature({ orderId: 'TB-ABC-123', statusCode: '200', grossAmount: '45000.00', signatureKey: 'x', serverKey: null })).toBe(false);
    expect(verifyMidtransSignature({ orderId: 'TB-ABC-123', statusCode: '200', grossAmount: '45000.00', signatureKey: 'x', serverKey: '' })).toBe(false);
  });
});

describe('midtrans transaction status mapping', () => {
  it('treats settlement as paid', () => {
    expect(mapMidtransPaymentState('settlement')).toEqual({ paymentStatus: 'paid', autoConfirmAppointment: true, autoCancelPendingHold: false });
  });
  it('keeps pending charges pending and challenges unconfirmed', () => {
    expect(mapMidtransPaymentState('pending').paymentStatus).toBe('pending');
    expect(mapMidtransPaymentState('capture', 'challenge').paymentStatus).toBe('pending');
    expect(mapMidtransPaymentState('capture', 'accept').paymentStatus).toBe('paid');
  });
  it('releases the slot on expire, cancel, and deny', () => {
    for (const status of ['expire', 'cancel', 'deny', 'failure']) {
      const transition = mapMidtransPaymentState(status);
      expect(transition.paymentStatus).toBe(status === 'expire' ? 'expired' : 'failed');
      expect(transition.autoCancelPendingHold).toBe(true);
    }
    expect(mapMidtransPaymentState('refund').paymentStatus).toBe('refunded');
  });
});

describe('midtrans environment handling', () => {
  it('uses sandbox for SB- keys and production otherwise', () => {
    expect(getMidtransBaseUrl('SB-Mid-server-x')).toBe('https://api.sandbox.midtrans.com');
    expect(getMidtransBaseUrl('Mid-server-x')).toBe('https://api.midtrans.com');
  });
  it('only allows Midtrans hosts as QR image sources', () => {
    expect(isAllowedMidtransQrUrl('https://api.sandbox.midtrans.com/v2/qris/abc/qr-code')).toBe(true);
    expect(isAllowedMidtransQrUrl('https://api.midtrans.com/v2/qris/abc/qr-code')).toBe(true);
    expect(isAllowedMidtransQrUrl('http://api.midtrans.com/v2/qris/abc/qr-code')).toBe(false);
    expect(isAllowedMidtransQrUrl('https://evil.example.com/qr.png')).toBe(false);
    expect(isAllowedMidtransQrUrl('not a url')).toBe(false);
  });
});

describe('midtrans QRIS charge', () => {
  it('posts a 15-minute QRIS charge and returns the QR image', async () => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', serverKey);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        status_code: '201',
        transaction_id: 'tx-1',
        qr_string: '00020101021226...',
        expiry_time: '2026-11-16 17:30:00',
        actions: [
          { name: 'generate-qr-code', method: 'GET', url: 'https://api.sandbox.midtrans.com/v2/qris/tx-1/qr-code' },
          { name: 'deeplink-redirect', method: 'GET', url: 'https://simulator.sandbox.midtrans.com/qris/index' }
        ]
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    });

    const charge = await chargeMidtransQris({ orderId: 'TB-123-abc', grossAmount: 45000, customerName: 'Raka', customerPhone: '+6281234567890', serviceSummary: 'Classic cut' });

    expect(charge.qrUrl).toBe('https://api.sandbox.midtrans.com/v2/qris/tx-1/qr-code');
    expect(charge.qrString).toContain('000201');
    expect(charge.transactionId).toBe('tx-1');
    expect(new Date(charge.expiresAt).toISOString()).toBe('2026-11-16T10:30:00.000Z');
    expect(calls[0].url).toBe('https://api.sandbox.midtrans.com/v2/charge');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.payment_type).toBe('qris');
    expect(body.transaction_details).toEqual({ order_id: 'TB-123-abc', gross_amount: 45000 });
    expect(body.custom_expiry).toEqual({ expiry_duration: 15, unit: 'minute' });
  });

  it('rejects non-Midtrans QR hosts and charges without a QR', async () => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', serverKey);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      status_code: '201', transaction_id: 'tx-2', actions: [{ name: 'generate-qr-code', url: 'https://evil.example.com/q.png' }]
    }), { status: 201 }));
    await expect(chargeMidtransQris({ orderId: 'x', grossAmount: 1, customerName: 'A', customerPhone: '1', serviceSummary: 'B' })).rejects.toThrow('midtrans_missing_qr');
  });

  it('fails loudly when the charge is rejected', async () => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', serverKey);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status_code: '406', status_message: 'invalid amount' }), { status: 406 }));
    await expect(chargeMidtransQris({ orderId: 'x', grossAmount: 0, customerName: 'A', customerPhone: '1', serviceSummary: 'B' })).rejects.toThrow(/midtrans_charge_failed/);
  });

  it('refuses to charge without a server key', async () => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', '');
    await expect(chargeMidtransQris({ orderId: 'x', grossAmount: 1, customerName: 'A', customerPhone: '1', serviceSummary: 'B' })).rejects.toThrow('midtrans_not_configured');
  });
});
