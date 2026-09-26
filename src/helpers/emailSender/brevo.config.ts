import axios from 'axios';

const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (!BREVO_API_KEY) {
  throw new Error('Missing Brevo API Key in .env');
}

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
  const endpoint = 'https://api.brevo.com/v3/smtp/email';

  const payload = {
    sender: {
      name: 'Khushbuwaala Perfumes',
      email: 'khushbuwaala@gmail.com', 
    },
    replyTo: {
      name: 'Khushbuwaala Support',
      email: 'khushbuwaala@gmail.com',
    },
    to,
    subject,
    htmlContent,
    textContent: textContent || htmlContent.replace(/<[^>]+>/g, ''),
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Brevo API Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to send email via Brevo');
  }
}