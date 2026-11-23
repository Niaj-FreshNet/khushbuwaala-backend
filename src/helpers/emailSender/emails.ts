import { sendEmail } from './email.config';
import {
  VERIFICATION_EMAIL_TEMPLATE,
  PASSWORD_RESET_REQUEST_TEMPLATE,
  PASSWORD_RESET_SUCCESS_TEMPLATE,
  WELCOME_EMAIL_TEMPLATE,
  CONTACT_FORM_TEMPLATE,
  ORDER_CONFIRMATION_TEMPLATE,
  ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE,
  ROLE_REJECTED_TEMPLATE,
  ROLE_APPROVED_TEMPLATE,
} from './emailTemplates';
import { errorMessage } from '../../utils/errorInfo';
import { asAddress, type AddressJson } from '../../types/records';

// Customer-entered text (name, address, note…) is escaped: it used to go into the HTML as typed.
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Put values into a {placeholder} template (only the given keys; a function, so a "$" in a value stays as typed) */
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/{(\w+)}/g, (m, key: string) => (key in values ? values[key] : m));

export const sendVerificationEmail = async (to: string, token: string) => {
  const template = VERIFICATION_EMAIL_TEMPLATE.replace(
    '{verificationCode}',
    token,
  );

  const response = await sendEmail(
    [{ email: to }],
    'Verify Your Account',
    template,
  );

  return response;
};

export const sendWelcomeEmail = async (to: string, name: string) => {
  const template = WELCOME_EMAIL_TEMPLATE.replace('{name}', name);
  const response = await sendEmail(
    [{ email: to }],
    'Welcome to Your App',
    template,
  );

  return response;
};

//forgot password

export const sendPasswordResetEmail = async (to: string, resetURL: string) => {
  // Use a global regular expression /.../g to replace every instance of {resetURL}
  const template = PASSWORD_RESET_REQUEST_TEMPLATE.replace(
    /{resetURL}/g, 
    resetURL
  );

  const response = await sendEmail(
    [{ email: to }],
    'Password Reset Request',
    template,
  );

  return response;
};

export const sendPasswordResetSuccessEmail = async (to: string) => {
  const template = PASSWORD_RESET_SUCCESS_TEMPLATE;

  const response = await sendEmail(
    [{ email: to }],
    'Password Reset Success',
    template,
  );

  return response;
};

export const sendPasswordChangeNotificationEmail = async (to: string, _name?: string) => {
  if (!to) return;

  const template = PASSWORD_RESET_SUCCESS_TEMPLATE;

  try {
    return await sendEmail(
      [{ email: to }],
      'Security Alert: Your Password Was Changed',
      template,
    );
  } catch (error) {
    // Non-blocking: log so an email transport failure doesn't roll back the DB transaction
    console.error('Failed to send password change alert email:', errorMessage(error));
  }
};

export const sendFeedbackEmail = async (
  name: string,
  email: string,
  subject: string,
  message: string,
) => {
  // Customer text is escaped; the message goes to the shop (it was sent to a developer's personal address)
  const template = fill(CONTACT_FORM_TEMPLATE, { name: esc(name), subject: esc(subject), message: esc(message), email: esc(email) });

  const response = await sendEmail(
    [{ email: process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'khushbuwaala@gmail.com' }],
    `New Contact Message: ${subject}`,
    template,
  );

  return response;
};

// ---------- order emails ----------
/** A line as order emails receive it: a database line or a plain object from checkout */
type EmailLine = {
  product?: { name?: string | null; primaryImage?: string | null } | null;
  productName?: string;
  productImageUrls?: string[];
  primaryImage?: string;
  name?: string;
  size?: number | string | null;
  unit?: string | null;
  selectedSize?: string;
  quantity?: number;
  price?: number;
  selectedPrice?: number;
};

type EmailOrder = {
  invoice?: string;
  amount?: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  district?: string | null;
  shipping?: unknown;
  billing?: unknown;
  customer?: { name?: string | null } | null;
  customerInfo?: AddressJson;
  orderItems?: EmailLine[];
  cartItems?: unknown;
};

export const sendOrderConfirmationEmail = async (to: string, order: EmailOrder) => {
  const ship = asAddress(order.shipping);
  const bill = asAddress(order.billing);
  const info = order.customerInfo ?? {};
  const email = to || ship.email || bill.email || info.email || order.email;

  if (!email) return;

  const customerName = ship.name || bill.name || order.customer?.name || info.name || order.name || 'Valued Customer';
  const address = ship.address || bill.address || info.address || order.address || 'N/A';
  const district = ship.district || info.district || order.district || '';
  const phone = ship.phone || bill.phone || info.phone || order.phone || 'N/A';

  const amount = Number(order.amount || 0);
  const invoice = String(order.invoice || 'N/A');

  // Accommodate both raw cartItems and populated Prisma orderItems
  const rawItems: EmailLine[] = order.orderItems || (Array.isArray(order.cartItems) ? (order.cartItems as EmailLine[]) : []);

  const itemsHTML = rawItems
    .map((item) => {
      const img = item.product?.primaryImage || item.productImageUrls?.[0] || item.primaryImage || '';
      const name = item.product?.name || item.productName || item.name || 'Product';
      const size = item.size ? `${item.size} ${item.unit || ''}`.trim() : item.selectedSize || 'Standard';
      const qty = item.quantity || 1;
      const price = Number(item.price || item.selectedPrice || 0);

      return `
        <li style="display: flex; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">
          ${img ? `<img src="${esc(img)}" alt="${esc(name)}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 6px; margin-right: 12px; border: 1px solid #eee;" />` : ''}
          <div style="flex: 1;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #111;">${esc(name)}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Size: ${esc(size)}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Qty: ${qty} &times; ৳${price.toFixed(2)}</p>
          </div>
          <div style="font-weight: 700; color: #111; font-size: 13px;">
            ৳${(price * qty).toFixed(2)}
          </div>
        </li>`;
    })
    .join('');

  const template = fill(ORDER_CONFIRMATION_TEMPLATE, {
    name: esc(customerName),
    invoice: esc(invoice),
    email: esc(email),
    address: esc(address),
    district: esc(district),
    phone: esc(phone),
    amount: amount.toFixed(2),
    items: itemsHTML,
  });

  try {
    return await sendEmail(
      [{ email }],
      `Order Confirmation - #${invoice}`,
      template,
    );
  } catch (err) {
    console.error('Failed to dispatch order confirmation email:', errorMessage(err));
  }
};

/** What the shop's own new-order email shows */
type AdminOrderNotice = {
  invoice?: string;
  name?: string | null;
  email?: string | null;
  address?: string | null;
  district?: string | null;
  phone?: string | null;
  amount?: number;
  cartItems?: EmailLine[];
  date?: string;
  note?: string | null;
  shipping?: unknown;
  customer?: { name?: string | null } | null;
};

export const sendOrderNotificationToAdmin = async (to: string, order: AdminOrderNotice) => {
  const { email, address, district, phone, amount, cartItems, date, note } = order;

  const customerName = order.name || asAddress(order.shipping).name || order.customer?.name || 'Valued Customer';

  const invoice = String(order.invoice || 'N/A');

  const itemsHTML = (cartItems || [])
    .map(
      (item) => `
        <li style="display: flex; align-items: center; margin-bottom: 15px;">
          ${item.productImageUrls?.[0] ? `<img src="${esc(item.productImageUrls[0])}" alt="${esc(item.productName)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px; margin-right: 15px;" />` : ''}
          <div>
            <p style="margin: 0 0 5px 0; font-weight: bold;">${esc(item.productName)}</p>
            <p style="margin: 0; font-size: 12px;">Size: ${esc(item.size)}</p>
            <p style="margin: 0; font-size: 12px;">Quantity: ${esc(item.quantity)}</p>
            <p style="margin: 0; font-size: 12px;">Unit Price: ৳${Number(item.price || 0).toFixed(2)}</p>
          </div>
        </li>`,
    )
    .join('');

  const template = fill(ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE, {
    invoice: esc(invoice),
    name: esc(customerName),
    email: esc(email || 'N/A'),
    address: esc(address || 'N/A'),
    district: esc(district || 'N/A'),
    phone: esc(phone || 'N/A'),
    date: esc(date || new Date().toLocaleDateString('en-GB')),
    note: esc(note || 'N/A'),
    amount: Number(amount || 0).toFixed(2),
    items: itemsHTML,
  });

  return await sendEmail([{ email: to }], `New Order Received - #${invoice}`, template);
};

export const sendRoleApprovalEmail = async (to: string, name: string, role: string) => {
  const formattedRole = role.replace(/_/g, ' '); // E.g., SUPER_ADMIN -> SUPER ADMIN
  const template = ROLE_APPROVED_TEMPLATE
    .replace(/{name}/g, name)
    .replace(/{role}/g, formattedRole);

  try {
    return await sendEmail([{ email: to }], 'Khushbuwaala - Account Approved', template);
  } catch (error) {
    console.error('Failed to send role approval email:', errorMessage(error));
  }
};

export const sendRoleRejectionEmail = async (to: string, name: string, role: string) => {
  const formattedRole = role.replace(/_/g, ' ');
  const template = ROLE_REJECTED_TEMPLATE
    .replace(/{name}/g, name)
    .replace(/{role}/g, formattedRole);

  try {
    return await sendEmail([{ email: to }], 'Khushbuwaala - Account Status Update', template);
  } catch (error) {
    console.error('Failed to send role rejection email:', errorMessage(error));
  }
};