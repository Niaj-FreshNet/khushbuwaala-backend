import { sendEmail } from './email.config';
import {
  VERIFICATION_EMAIL_TEMPLATE,
  PASSWORD_RESET_REQUEST_TEMPLATE,
  PASSWORD_RESET_SUCCESS_TEMPLATE,
  WELCOME_EMAIL_TEMPLATE,
  CONTACT_FORM_TEMPLATE,
  ORDER_CONFIRMATION_TEMPLATE,
  ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE,
} from './emailTemplates';

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

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const template = PASSWORD_RESET_REQUEST_TEMPLATE.replace('{resetURL}', token);
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

export const sendPasswordChangeNotificationEmail = async (to: string, name?: string) => {
  if (!to) return;

  const template = PASSWORD_RESET_SUCCESS_TEMPLATE;

  try {
    return await sendEmail(
      [{ email: to }],
      'Security Alert: Your Password Was Changed',
      template,
    );
  } catch (error: any) {
    // Non-blocking: log so an email transport failure doesn't roll back the DB transaction
    console.error('Failed to send password change alert email:', error.message);
  }
};

export const sendFeedbackEmail = async (
  name: string,
  email: string,
  subject: string,
  message: string,
) => {
  const template = CONTACT_FORM_TEMPLATE.replace('{name}', name)
    .replace('{subject}', subject)
    .replace('{message}', message)
    .replace(/{email}/g, email);

  const response = await sendEmail(
    [{ email: 'azizultushar98@gmail.com' }],
    `New Contact Message: ${subject}`,
    template,
  );

  console.log(`see response`, response);

  return response;
};

export const sendOrderConfirmationEmail = async (to: string, order: any) => {
  const email =
    to ||
    order?.shipping?.email ||
    order?.billing?.email ||
    order?.customerInfo?.email ||
    order?.email;

  if (!email) return;

  const address =
    order?.shipping?.address ||
    order?.billing?.address ||
    order?.customerInfo?.address ||
    order?.address ||
    'N/A';

  const district =
    order?.shipping?.district ||
    order?.customerInfo?.district ||
    order?.district ||
    '';

  const phone =
    order?.shipping?.phone ||
    order?.billing?.phone ||
    order?.customerInfo?.phone ||
    order?.phone ||
    'N/A';

  const amount = Number(order?.amount || 0);
  const invoice = String(order?.invoice || 'N/A');
  const orderId = String(order?.id || order?._id || 'N/A');

  // Accommodate both raw cartItems and populated Prisma orderItems
  const rawItems = order?.orderItems || order?.cartItems || [];

  const itemsHTML = rawItems
    .map((item: any) => {
      const img =
        item.product?.primaryImage ||
        item.productImageUrls?.[0] ||
        item.primaryImage ||
        '';

      const name = item.product?.name || item.productName || item.name || 'Product';
      const size = item.size ? `${item.size} ${item.unit || ''}`.trim() : item.selectedSize || 'Standard';
      const qty = item.quantity || 1;
      const price = Number(item.price || item.selectedPrice || 0);

      return `
        <li style="display: flex; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">
          ${img ? `<img src="${img}" alt="${name}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 6px; margin-right: 12px; border: 1px solid #eee;" />` : ''}
          <div style="flex: 1;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #111;">${name}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Size: ${size}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Qty: ${qty} &times; ৳${price.toFixed(2)}</p>
          </div>
          <div style="font-weight: 700; color: #111; font-size: 13px;">
            ৳${(price * qty).toFixed(2)}
          </div>
        </li>`;
    })
    .join('');

  // Replace placeholders including invoice and orderId
  const template = ORDER_CONFIRMATION_TEMPLATE
    .replace(/{invoice}/g, invoice)
    .replace(/{orderId}/g, orderId)
    .replace(/{email}/g, email)
    .replace(/{address}/g, address)
    .replace(/{district}/g, district)
    .replace(/{phone}/g, phone)
    .replace(/{amount}/g, amount.toFixed(2))
    .replace(/{items}/g, itemsHTML);

  try {
    return await sendEmail(
      [{ email }],
      `Order Confirmation - #${invoice}`,
      template,
    );
  } catch (err: any) {
    console.error('Failed to dispatch order confirmation email:', err.message);
  }
};
export const sendOrderNotificationToAdmin = async (to: string, order: any) => {
  const { email, address, district, phone, amount, cartItems, date, note } = order;

  const orderId = String(order.invoice ? `${order.invoice} (${order.id || order._id})` : order.id || 'N/A');

  const itemsHTML = (cartItems || [])
    .map(
      (item: any) => `
        <li style="display: flex; align-items: center; margin-bottom: 15px;">
          ${item.productImageUrls?.[0] ? `<img src="${item.productImageUrls[0]}" alt="${item.productName}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px; margin-right: 15px;" />` : ''}
          <div>
            <p style="margin: 0 0 5px 0; font-weight: bold;">${item.productName}</p>
            <p style="margin: 0; font-size: 12px;">Size: ${item.size}</p>
            <p style="margin: 0; font-size: 12px;">Quantity: ${item.quantity}</p>
            <p style="margin: 0; font-size: 12px;">Unit Price: ৳${Number(item.price || 0).toFixed(2)}</p>
          </div>
        </li>`,
    )
    .join('');

  const template = ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE
    .replace(/{orderId}/g, orderId)
    .replace(/{email}/g, email || 'N/A')
    .replace(/{address}/g, address || 'N/A')
    .replace(/{district}/g, district || 'N/A')
    .replace(/{phone}/g, phone || 'N/A')
    .replace(/{date}/g, date || new Date().toLocaleDateString('en-GB'))
    .replace(/{note}/g, note || 'N/A')
    .replace(/{amount}/g, Number(amount || 0).toFixed(2))
    .replace(/{items}/g, itemsHTML);

  return await sendEmail([{ email: to }], `New Order Received - #${order.invoice || order.id}`, template);
};