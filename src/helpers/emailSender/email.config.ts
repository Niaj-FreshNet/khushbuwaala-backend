import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

interface EmailContact {
  email: string;
  name?: string;
}

export async function sendEmail(
  to: EmailContact[],
  subject: string,
  htmlContent: string,
  textContent?: string,
): Promise<any> {
  const recipients = to.map((recipient) => recipient.email).join(', ');

  const mailOptions = {
    from: `"Khushbuwaala" <${process.env.GMAIL_USER}>`,
    to: recipients,
    subject: subject,
    html: htmlContent,
    text: textContent || htmlContent.replace(/<[^>]+>/g, ''),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error: any) {
    console.error('Gmail SMTP Error:', error.message);
    throw new Error('Failed to send email via Gmail');
  }
}