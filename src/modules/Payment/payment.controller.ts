import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { PaymentServices } from './payment.service';

const getAllPaymentHistory = catchAsync(async (req, res) => {
  const result = await PaymentServices.getAllPaymentHistory(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Payment history retrieved successfully',
    data: result,
  });
});

export const PaymentController = {
  getAllPaymentHistory,
};