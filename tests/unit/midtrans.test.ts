import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeMidtransSignature,
  getMidtransBaseUrl,
  isAllowedMidtransQrUrl,
  mapMidtransPaymentState,
  verifyMidtransSignature
} from '@/lib/midtrans';

const serverKey = 'SB-Mid-server-test-key';

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
