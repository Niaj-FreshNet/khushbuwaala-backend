// Builds the Purchase event the server sends to Meta (Conversions API). Pure: no network, no clock.
//
// The browser sends the same Purchase with the same event_id (`kw_<orderId>`), so Meta counts the
// two as one order. Customer details are hashed here (SHA-256) and never sent in the clear.
import crypto from 'crypto';
import { asAddress } from '../types/records';

/** What the Meta Purchase event needs from an order */
export type CapiOrder = {
  id: string;
  amount?: number | null;
  shippingCost?: number | null;
  shipping?: unknown;
  orderItems?: { productId?: string | null; product?: { id?: string } | null; quantity?: number; price?: number }[];
};

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/** Meta matches phone numbers with the country code and digits only: 01712345678 → 8801712345678 */
export const normalizeBdPhone = (phone: string | null | undefined): string | undefined => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('880') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
  if (digits.startsWith('1') && digits.length === 10) return `880${digits}`;
  return digits.length >= 10 ? digits : undefined;
};

const hashed = (value: string | null | undefined): string[] | undefined => {
  const v = String(value ?? '').trim().toLowerCase();
  return v ? [sha256(v)] : undefined;
};

export const metaPurchaseEventId = (orderId: string): string => `kw_${orderId}`;

export const buildMetaPurchasePayload = (
  order: CapiOrder,
  opts: { email?: string | null; phone?: string | null; nowSeconds: number; siteUrl: string; testEventCode?: string }
) => {
  const ship = asAddress(order.shipping);
  // Meta wants first and last name separately
  const nameParts = String(ship.name ?? '').trim().split(/\s+/).filter(Boolean);
  const phone = normalizeBdPhone(opts.phone);

  return {
    ...(opts.testEventCode ? { test_event_code: opts.testEventCode } : {}),
    data: [
      {
        event_name: 'Purchase',
        event_time: opts.nowSeconds,
        event_id: metaPurchaseEventId(order.id),
        event_source_url: `${opts.siteUrl}/thank-you`,
        action_source: 'website',
        user_data: {
          em: hashed(opts.email),
          ph: phone ? [sha256(phone)] : undefined,
          fn: hashed(nameParts[0]),
          ln: nameParts.length > 1 ? hashed(nameParts.slice(1).join(' ')) : undefined,
          ct: hashed(String(ship.district ?? '').replace(/\s+/g, '')),
          country: [sha256('bd')],
          fbp: ship.fbp || undefined, // the customer's browser ids, saved with the order
          fbc: ship.fbc || undefined,
        },
        custom_data: {
          currency: 'BDT',
          value: Number(order.amount || 0),
          shipping: Number(order.shippingCost || 0),
          order_id: order.id,
          contents: (order.orderItems || [])
            .map((it) => ({
              id: String(it.productId || it.product?.id || ''),
              quantity: Math.max(1, Number(it.quantity || 1)),
              item_price: Number(it.price || 0),
            }))
            .filter((c) => c.id),
          content_type: 'product',
        },
      },
    ],
  };
};
