import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ContactServices } from './contact.service';

const createContact = catchAsync(async (req, res) => {
  const result = await ContactServices.createContact(req.body); // no need to assign result

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Contact email sent successfully',
    data: result,
  });
});

export const ContactController = { createContact };
