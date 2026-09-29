const BRAND_COLOR = '#1b382b'; // Deep botanical emerald
const ACCENT_COLOR = '#4a7c59'; // Soft laurel / sage accent
const BG_COLOR = '#F6F8F6';     // Cool clean background
const BORDER_COLOR = '#E2E8E4'; // Subtle border tone

export const VERIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #A3C9A8; margin: 6px 0 0 0; font-size: 12px; letter-spacing: 1.5px; font-weight: 500;">PURE & ARTISANAL FRAGRANCES</p>
    </div>
    <div style="padding: 36px 30px;">
      <h2 style="margin: 0 0 14px; font-size: 19px; color: #111827; font-weight: 600;">Verify Your Account</h2>
      <p style="margin: 0 0 20px; color: #4B5563; font-size: 14px;">Welcome to Khushbuwaala. To begin exploring our artisanal attars and fragrance oils, please confirm your email address using the verification code below:</p>
      
      <div style="text-align: center; margin: 28px 0; background: ${BG_COLOR}; border: 1px dashed ${ACCENT_COLOR}; border-radius: 8px; padding: 22px;">
        <span style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: ${BRAND_COLOR}; font-family: monospace;">{verificationCode}</span>
      </div>
      
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 16px;">This code will expire in <strong>15 minutes</strong>.</p>
      <p style="font-size: 12px; color: #9CA3AF; margin: 0;">If you didn't create an account with Khushbuwaala, you can safely disregard this email.</p>
    </div>
    <div style="border-top: 1px solid ${BORDER_COLOR}; padding: 18px; text-align: center; font-size: 12px; color: #9CA3AF;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_COLOR}; text-decoration: none; font-weight: 500;">khushbuwaala.com</a></p>
    </div>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_REQUEST_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #A3C9A8; margin: 6px 0 0 0; font-size: 12px; letter-spacing: 1.5px; font-weight: 500;">ACCOUNT SECURITY</p>
    </div>
    <div style="padding: 36px 30px;">
      <h2 style="margin: 0 0 14px; font-size: 19px; color: #111827; font-weight: 600;">Password Reset Request</h2>
      <p style="margin: 0 0 24px; color: #4B5563; font-size: 14px;">We received a request to reset your Khushbuwaala account password. Click the button below to proceed:</p>
      
      <div style="text-align: center; margin: 28px 0;">
        <a href="{resetURL}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 13px 26px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; display: inline-block;">Reset Password</a>
      </div>
      
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 12px;">This link will expire in <strong>15 minutes</strong>.</p>
      <p style="font-size: 12px; color: #9CA3AF; margin: 0; word-break: break-all;">Button not working? Paste this link into your browser:<br><a href="{resetURL}" style="color: ${ACCENT_COLOR}; text-decoration: underline;">{resetURL}</a></p>
    </div>
    <div style="border-top: 1px solid ${BORDER_COLOR}; padding: 18px; text-align: center; font-size: 12px; color: #9CA3AF;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_COLOR}; text-decoration: none; font-weight: 500;">khushbuwaala.com</a></p>
    </div>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_SUCCESS_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #A3C9A8; margin: 6px 0 0 0; font-size: 12px; letter-spacing: 1.5px; font-weight: 500;">ACCOUNT STATUS</p>
    </div>
    <div style="padding: 36px 30px; text-align: center;">
      <div style="background-color: #E8F0EA; color: ${BRAND_COLOR}; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; display: inline-block; font-size: 24px; margin-bottom: 16px;">
        ✓
      </div>
      <h2 style="margin: 0 0 12px; font-size: 19px; color: #111827; font-weight: 600;">Password Updated</h2>
      <p style="margin: 0 0 20px; color: #4B5563; font-size: 14px; text-align: center;">Your Khushbuwaala password has been changed successfully. You can now log in securely.</p>
      
      <div style="margin: 20px 0 0; padding: 14px; background-color: ${BG_COLOR}; border-radius: 6px; text-align: left; font-size: 13px; color: #4B5563;">
        If you did not make this change, please contact us immediately at <a href="mailto:khushbuwaala@gmail.com" style="color: ${ACCENT_COLOR}; font-weight: 500;">khushbuwaala@gmail.com</a>.
      </div>
    </div>
    <div style="border-top: 1px solid ${BORDER_COLOR}; padding: 18px; text-align: center; font-size: 12px; color: #9CA3AF;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_COLOR}; text-decoration: none; font-weight: 500;">khushbuwaala.com</a></p>
    </div>
  </div>
</body>
</html>
`;

export const WELCOME_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Khushbuwaala</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #A3C9A8; margin: 6px 0 0 0; font-size: 12px; letter-spacing: 1.5px; font-weight: 500;">THE ART OF SCENT</p>
    </div>
    <div style="padding: 36px 30px;">
      <h2 style="margin: 0 0 14px; font-size: 19px; color: #111827; font-weight: 600;">Greetings, {name}</h2>
      <p style="margin: 0 0 16px; color: #4B5563; font-size: 14px;">Welcome to <strong>Khushbuwaala</strong>. Your email is verified and your account is active.</p>
      <p style="margin: 0 0 24px; color: #4B5563; font-size: 14px;">From pure single-origin attars to signature concentrated oils, our fragrances are blended for longevity, depth, and character.</p>
      
      <div style="text-align: center; margin: 28px 0;">
        <a href="https://khushbuwaala.com" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 13px 26px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; display: inline-block;">Explore Collection</a>
      </div>
      
      <p style="font-size: 13px; color: #6B7280; margin: 0;">May every fragrance bring a calm, memorable presence.</p>
    </div>
    <div style="border-top: 1px solid ${BORDER_COLOR}; padding: 18px; text-align: center; font-size: 12px; color: #9CA3AF;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_COLOR}; text-decoration: none; font-weight: 500;">khushbuwaala.com</a></p>
    </div>
  </div>
</body>
</html>
`;

export const CONTACT_FORM_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Khushbuwaala - Contact Message</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 26px; text-align: center;">
      <h2 style="color: #ffffff; margin: 0; font-size: 18px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Customer Inquiry</h2>
      <p style="color: #A3C9A8; margin: 4px 0 0 0; font-size: 12px; font-weight: 500;">KHUSHBUWAALA CONCIERGE</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6B7280; width: 90px;">Name:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #111827;">{name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6B7280;">Email:</td>
          <td style="padding: 6px 0;"><a href="mailto:{email}" style="color: ${ACCENT_COLOR}; text-decoration: none; font-weight: 500;">{email}</a></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6B7280;">Subject:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #111827;">{subject}</td>
        </tr>
      </table>
      
      <div style="background-color: ${BG_COLOR}; border: 1px solid ${BORDER_COLOR}; border-radius: 6px; padding: 16px; margin-top: 10px;">
        <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-line;">{message}</p>
      </div>
    </div>
    <div style="border-top: 1px solid ${BORDER_COLOR}; padding: 14px; text-align: center; font-size: 12px; color: #9CA3AF;">
      Submitted via Khushbuwaala storefront contact form.
    </div>
  </div>
</body>
</html>
`;

export const ORDER_CONFIRMATION_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #A3C9A8; margin: 6px 0 0 0; font-size: 12px; letter-spacing: 1.5px; font-weight: 500;">ORDER CONFIRMATION</p>
      <p style="color: #F3F4F6; margin: 8px 0 0 0; font-size: 13px; font-weight: 500;">Invoice: #{invoice} | Order Ref: #{orderId}</p>
    </div>
    
    <div style="padding: 30px;">
      <h2 style="font-size: 18px; margin: 0 0 8px; color: #111827; font-weight: 600;">Thank you for your order</h2>
      <p style="margin: 0 0 22px; font-size: 14px; color: #4B5563;">Your fragrances are being prepared for dispatch. Here are the details of your purchase:</p>
      
      <div style="background-color: ${BG_COLOR}; border: 1px solid ${BORDER_COLOR}; border-radius: 8px; padding: 18px; margin-bottom: 24px; font-size: 13px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #6B7280;">Invoice No:</td>
            <td style="padding: 4px 0; font-weight: 600; text-align: right; color: #111827;">#{invoice}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B7280;">Order ID:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right; font-family: monospace; font-size: 12px; color: #374151;">{orderId}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B7280;">Customer Email:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right; color: #374151;">{email}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B7280;">Shipping Destination:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right; color: #374151;">{address}, {district}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6B7280;">Contact:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right; color: #374151;">{phone}</td>
          </tr>
          <tr style="border-top: 1px solid ${BORDER_COLOR};">
            <td style="padding: 10px 0 2px; font-weight: 600; color: #111827;">Total Paid:</td>
            <td style="padding: 10px 0 2px; font-weight: 700; font-size: 16px; color: ${BRAND_COLOR}; text-align: right;">৳ {amount}</td>
          </tr>
        </table>
      </div>

      <h3 style="font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 14px; color: #374151; border-bottom: 1px solid ${BORDER_COLOR}; padding-bottom: 8px;">Order Summary</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        {items}
      </ul>
      
      <p style="font-size: 13px; color: #6B7280; margin: 26px 0 0; text-align: center;">Have a question about your order? Reply directly to this email.</p>
    </div>

    <div style="border-top: 1px solid ${BORDER_COLOR}; padding: 18px; text-align: center; font-size: 12px; color: #9CA3AF;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_COLOR}; text-decoration: none; font-weight: 500;">khushbuwaala.com</a></p>
    </div>
  </div>
</body>
</html>
`;

export const ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Khushbuwaala - New Order Received</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 32px 12px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="background-color: ${BRAND_COLOR}; padding: 24px 28px;">
      <h2 style="color: #ffffff; margin: 0; font-size: 17px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">New Order Received</h2>
      <p style="color: #A3C9A8; margin: 4px 0 0 0; font-size: 12px;">Order ID: {orderId}</p>
    </div>
    
    <div style="padding: 28px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #6B7280; width: 120px;">Order Date:</td>
          <td style="padding: 6px 0; font-weight: 500; color: #111827;">{date}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6B7280;">Customer:</td>
          <td style="padding: 6px 0; font-weight: 500;"><a href="mailto:{email}" style="color: ${ACCENT_COLOR}; text-decoration: none;">{email}</a></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6B7280;">Shipping:</td>
          <td style="padding: 6px 0; font-weight: 500; color: #111827;">{address}, District: {district}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6B7280;">Phone:</td>
          <td style="padding: 6px 0; font-weight: 500; color: #111827;">{phone}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6B7280;">Note:</td>
          <td style="padding: 6px 0; font-weight: 500; color: #111827;">{note}</td>
        </tr>
        <tr style="border-top: 1px solid ${BORDER_COLOR};">
          <td style="padding: 10px 0; font-weight: 600; color: #111827;">Order Total:</td>
          <td style="padding: 10px 0; font-weight: 700; font-size: 16px; color: ${BRAND_COLOR};">৳ {amount}</td>
        </tr>
      </table>

      <h3 style="font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin: 18px 0 10px; color: #374151; border-bottom: 1px solid ${BORDER_COLOR}; padding-bottom: 6px;">Packing List</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        {items}
      </ul>
      
      <div style="margin-top: 24px; padding: 12px; background-color: ${BG_COLOR}; border-radius: 6px; text-align: center; font-size: 12px; color: #6B7280;">
        Update order fulfillment and status inside your admin dashboard.
      </div>
    </div>
  </div>
</body>
</html>
`;