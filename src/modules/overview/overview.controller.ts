import catchAsync from '../../utils/catchAsync';
import { OverviewServices } from './overview.service';
import sendResponse from '../../utils/sendResponse';

const getOverview = catchAsync(async (req, res) => {
  const result = await OverviewServices.getOverview();
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Overview Fetched Successfully'
      : 'Overview Fetching Failed',
    data: isok ? result : [],
  });
});

const getWeeklyOverview = catchAsync(async (req, res) => {
  const result = await OverviewServices.getWeeklyOverview();
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Overview Fetched Successfully'
      : 'Overview Fetching Failed',
    data: isok ? result : [],
  });
});

const getWeeklySales = catchAsync(async (req, res) => {
  const result = await OverviewServices.getWeeklySales();
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Overview Fetched Successfully'
      : 'Overview Fetching Failed',
    data: isok ? result : [],
  });
});

export const OverviewController = {
  getOverview,
  getWeeklyOverview,
  getWeeklySales,
};
