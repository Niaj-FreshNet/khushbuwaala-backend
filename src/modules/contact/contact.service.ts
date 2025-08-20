import { sendFeedbackEmail } from '../../helpers/emailSender/emails';
import { IContact } from './contact.interface';

const createContact = async (payload: IContact) => {
  const result = await sendFeedbackEmail(
    payload.name,
    payload.email,
    payload.subject,
    payload.message,
  );
  return result;
};

export const ContactServices = { createContact };
