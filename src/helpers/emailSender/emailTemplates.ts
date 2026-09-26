const BRAND_COLOR = '#1A1A1A';
const ACCENT_GOLD = '#C59A45';
const BG_COLOR = '#F9F7F4';

export const VERIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 30px; text-align: center;">
      <h1 style="color: ${ACCENT_GOLD}; margin: 0; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #ECE5D8; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px;">PURE & ARTISANAL FRAGRANCES</p>
    </div>
    <div style="padding: 35px 30px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #111;">Verify Your Account</h2>
      <p style="margin: 0 0 20px; color: #555;">Welcome to Khushbuwaala. To begin exploring our artisanal attars and fragrance oils, please confirm your email address using the one-time code below:</p>
      
      <div style="text-align: center; margin: 30px 0; background: ${BG_COLOR}; border: 1px dashed ${ACCENT_GOLD}; border-radius: 6px; padding: 20px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: ${BRAND_COLOR}; font-family: monospace;">{verificationCode}</span>
      </div>
      
      <p style="font-size: 13px; color: #777; margin: 0 0 20px;">This security code will expire in <strong>15 minutes</strong>.</p>
      <p style="font-size: 13px; color: #999; margin: 0;">If you did not initiate this registration with Khushbuwaala, you can safely disregard this message.</p>
    </div>
    <div style="border-top: 1px solid #EAE5DE; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_GOLD}; text-decoration: none;">khushbuwaala.com</a></p>
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 30px; text-align: center;">
      <h1 style="color: ${ACCENT_GOLD}; margin: 0; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #ECE5D8; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px;">ACCOUNT SECURITY</p>
    </div>
    <div style="padding: 35px 30px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #111;">Password Reset Request</h2>
      <p style="margin: 0 0 24px; color: #555;">We received a request to reset the password associated with your Khushbuwaala account. Select the button below to establish a new password:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="{resetURL}" style="background-color: ${BRAND_COLOR}; color: #ffffff; border: 1px solid ${ACCENT_GOLD}; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px; letter-spacing: 1px; display: inline-block;">RESET MY PASSWORD</a>
      </div>
      
      <p style="font-size: 13px; color: #777; margin: 0 0 10px;">This link will expire in <strong>15 minutes</strong> for account integrity.</p>
      <p style="font-size: 12px; color: #999; margin: 0; word-break: break-all;">If the button does not work, paste this URL into your browser:<br><a href="{resetURL}" style="color: #666;">{resetURL}</a></p>
    </div>
    <div style="border-top: 1px solid #EAE5DE; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_GOLD}; text-decoration: none;">khushbuwaala.com</a></p>
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 30px; text-align: center;">
      <h1 style="color: ${ACCENT_GOLD}; margin: 0; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #ECE5D8; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px;">ACCOUNT STATUS</p>
    </div>
    <div style="padding: 35px 30px; text-align: center;">
      <div style="background-color: #F3ECE1; color: ${ACCENT_GOLD}; width: 60px; height: 60px; line-height: 60px; border-radius: 50%; display: inline-block; font-size: 28px; margin-bottom: 20px; border: 1px solid ${ACCENT_GOLD};">
        ✓
      </div>
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #111;">Password Successfully Updated</h2>
      <p style="margin: 0 0 24px; color: #555; text-align: left;">Your Khushbuwaala account credentials have been successfully updated. You may now log in securely using your new password.</p>
      
      <div style="margin: 25px 0 0; padding: 15px; background-color: #FAF8F5; border-left: 3px solid ${ACCENT_GOLD}; text-align: left; font-size: 13px; color: #666;">
        If you did not make this change, please reach out to our team immediately at <a href="mailto:support@khushbuwaala.com" style="color: ${ACCENT_GOLD};">support@khushbuwaala.com</a>.
      </div>
    </div>
    <div style="border-top: 1px solid #EAE5DE; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_GOLD}; text-decoration: none;">khushbuwaala.com</a></p>
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 30px; text-align: center;">
      <h1 style="color: ${ACCENT_GOLD}; margin: 0; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #ECE5D8; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px;">THE ESSENCE OF PURITY</p>
    </div>
    <div style="padding: 35px 30px;">
      <h2 style="margin: 0 0 16px; font-size: 20px; color: #111;">Greetings, {name}</h2>
      <p style="margin: 0 0 16px; color: #555;">Welcome to <strong>Khushbuwaala</strong>. Your email is verified, and your account is confirmed.</p>
      <p style="margin: 0 0 20px; color: #555;">From rare single-origin attars to precision fragrance oils, our blends are crafted for enduring character, projection, and depth.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://khushbuwaala.com" style="background-color: ${BRAND_COLOR}; color: #ffffff; border: 1px solid ${ACCENT_GOLD}; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px; letter-spacing: 1px; display: inline-block;">EXPLORE THE COLLECTION</a>
      </div>
      
      <p style="font-size: 13px; color: #777; margin: 0;">May every fragrance you discover leave a memorable trail.</p>
    </div>
    <div style="border-top: 1px solid #EAE5DE; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_GOLD}; text-decoration: none;">khushbuwaala.com</a></p>
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
  <title>Khushbuwaala - Contact Query</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 25px; text-align: center;">
      <h2 style="color: ${ACCENT_GOLD}; margin: 0; font-size: 20px; letter-spacing: 1.5px; text-transform: uppercase;">Customer Inquiry</h2>
      <p style="color: #ECE5D8; margin: 4px 0 0 0; font-size: 12px;">KHUSHBUWAALA CONCIERGE</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #888; width: 100px;">Sender:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #111;">{name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #888;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:{email}" style="color: ${ACCENT_GOLD}; text-decoration: none;">{email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #888;">Subject:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #111;">{subject}</td>
        </tr>
      </table>
      
      <div style="background-color: ${BG_COLOR}; border: 1px solid #EAE5DE; border-radius: 6px; padding: 18px; margin-top: 10px;">
        <p style="margin: 0; font-size: 14px; color: #333; white-space: pre-line;">{message}</p>
      </div>
    </div>
    <div style="border-top: 1px solid #EAE5DE; padding: 16px; text-align: center; font-size: 12px; color: #888;">
      Inquiry received via Khushbuwaala storefront.
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 30px; text-align: center;">
      <h1 style="color: ${ACCENT_GOLD}; margin: 0; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Khushbuwaala</h1>
      <p style="color: #ECE5D8; margin: 6px 0 0 0; font-size: 13px; letter-spacing: 1px;">ORDER CONFIRMATION</p>
    </div>
    
    <div style="padding: 30px;">
      <h2 style="font-size: 18px; margin: 0 0 8px; color: #111;">Thank you for your order</h2>
      <p style="margin: 0 0 24px; font-size: 14px; color: #555;">Our team is preparing your fragrances for packaging. You will find your order details below:</p>
      
      <div style="background-color: ${BG_COLOR}; border: 1px solid #EAE5DE; border-radius: 6px; padding: 16px; margin-bottom: 25px; font-size: 13px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #777;">Customer Email:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">{email}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #777;">Shipping Destination:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">{address}, {zipcode}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #777;">Contact:</td>
            <td style="padding: 4px 0; font-weight: 500; text-align: right;">{phone}</td>
          </tr>
          <tr style="border-top: 1px solid #DDD6C8;">
            <td style="padding: 10px 0 4px; font-weight: 600; color: #111;">Total Amount:</td>
            <td style="padding: 10px 0 4px; font-weight: 700; font-size: 16px; color: ${ACCENT_GOLD}; text-align: right;">$ {amount}</td>
          </tr>
        </table>
      </div>

      <h3 style="font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 12px; color: #333; border-bottom: 1px solid #EAE5DE; padding-bottom: 8px;">Selections</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        {items}
      </ul>
      
      <p style="font-size: 13px; color: #777; margin: 25px 0 0; text-align: center;">Have inquiries about your selection? Simply reply directly to this email.</p>
    </div>

    <div style="border-top: 1px solid #EAE5DE; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      <p style="margin: 0 0 4px;">&copy; ${new Date().getFullYear()} Khushbuwaala. All rights reserved.</p>
      <p style="margin: 0;"><a href="https://khushbuwaala.com" style="color: ${ACCENT_GOLD}; text-decoration: none;">khushbuwaala.com</a></p>
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
  <title>Khushbuwaala - New Order Dispatch</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2B2B2B; background-color: ${BG_COLOR}; margin: 0; padding: 30px 10px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EAE5DE;">
    <div style="background-color: ${BRAND_COLOR}; padding: 25px 30px; border-bottom: 2px solid ${ACCENT_GOLD};">
      <h2 style="color: #ffffff; margin: 0; font-size: 18px; letter-spacing: 1px; text-transform: uppercase;">[Dispatch Alert] New Order Received</h2>
      <p style="color: ${ACCENT_GOLD}; margin: 4px 0 0 0; font-size: 12px;">Order ID: {orderId}</p>
    </div>
    
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #777; width: 130px;">Order Date:</td>
          <td style="padding: 6px 0; font-weight: 500;">{date}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #777;">Customer Email:</td>
          <td style="padding: 6px 0; font-weight: 500;"><a href="mailto:{email}" style="color: ${ACCENT_GOLD};">{email}</a></td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #777;">Shipping Address:</td>
          <td style="padding: 6px 0; font-weight: 500;">{address}, Zip: {zipcode}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #777;">Phone:</td>
          <td style="padding: 6px 0; font-weight: 500;">{phone}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #777;">Customer Note:</td>
          <td style="padding: 6px 0; font-weight: 500;">{note}</td>
        </tr>
        <tr style="border-top: 1px solid #EAE5DE;">
          <td style="padding: 10px 0; font-weight: 700; color: #111;">Order Total:</td>
          <td style="padding: 10px 0; font-weight: 700; font-size: 16px; color: #111;">$ {amount}</td>
        </tr>
      </table>

      <h3 style="font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase; margin: 20px 0 10px; color: #333; border-bottom: 1px solid #EAE5DE; padding-bottom: 6px;">Items to Pack:</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        {items}
      </ul>
      
      <div style="margin-top: 25px; padding: 12px; background-color: ${BG_COLOR}; border-radius: 4px; text-align: center; font-size: 12px; color: #666;">
        Review inventory levels and update shipment status in the Khushbuwaala Admin Panel.
      </div>
    </div>
  </div>
</body>
</html>
`;