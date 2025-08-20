import { sendEmail } from './brevo.config';
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
  const { email, address, zipcode, phone, amount, cartItems } = order;

  // Build item list with updated fields
  const itemsHTML = cartItems
    .map(
      (item: any) => `
        <li style="display: flex; align-items: center; margin-bottom: 15px;">
          <img src="${item.productImageUrls?.[0] || ''}" alt="${item.productName}" 
               style="width: 60px; height: 60px; object-fit: cover; border-radius: 5px; margin-right: 15px;" />
          <div>
            <p style="margin: 0 0 5px 0; font-weight: bold;">${item.productName}</p>
            <p style="margin: 0;">Size: ${item.size} | Color: ${item.color}</p>
            <p style="margin: 0;">Quantity: ${item.quantity}</p>
            ${
              item.price
                ? `<p style="margin: 0;">Unit Price: $${item.price.toFixed(2)}</p>`
                : ''
            }
          </div>
        </li>`,
    )
    .join('');

  // Inject values into the email template
  const template = ORDER_CONFIRMATION_TEMPLATE.replace(/{email}/g, email)
    .replace(/{address}/g, address || 'N/A')
    .replace(/{zipcode}/g, zipcode || 'N/A')
    .replace(/{phone}/g, phone || 'N/A')
    .replace(/{amount}/g, (amount || 0).toFixed(2))
    .replace(/{items}/g, itemsHTML);

  // Send the email
  const response = await sendEmail(
    [{ email: to }],
    'Your Order Confirmation',
    template,
  );

  return response;
};

export const sendOrderNotificationToAdmin = async (to: string, order: any) => {
  const { email, address, zipcode, phone, amount, cartItems, id, date, note } =
    order;

  // Build item list with updated fields
  const itemsHTML = cartItems
    .map(
      (item: any) => `
        <li style="display: flex; align-items: center; margin-bottom: 15px;">
          <img src="${item.productImageUrls?.[0] || ''}" alt="${item.productName}" 
               style="width: 60px; height: 60px; object-fit: cover; border-radius: 5px; margin-right: 15px;" />
          <div>
            <p style="margin: 0 0 5px 0; font-weight: bold;">${item.productName}</p>
            <p style="margin: 0;">Size: ${item.size} | Color: ${item.color}</p>
            <p style="margin: 0;">Quantity: ${item.quantity}</p>
            ${
              item.price
                ? `<p style="margin: 0;">Unit Price: $${item.price.toFixed(2)}</p>`
                : ''
            }
          </div>
        </li>`,
    )
    .join('');

  const template = ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE.replace(
    /{orderId}/g,
    id,
  )
    .replace(/{email}/g, email)
    .replace(/{address}/g, address || 'N/A')
    .replace(/{zipcode}/g, zipcode || 'N/A')
    .replace(/{phone}/g, phone || 'N/A')
    .replace(/{date}/g, date || '')
    .replace(/{note}/g, note || 'N/A')
    .replace(/{amount}/g, (amount || 0).toFixed(2))
    .replace(/{items}/g, itemsHTML);

  return await sendEmail([{ email: to }], 'New Order Received', template);
};
