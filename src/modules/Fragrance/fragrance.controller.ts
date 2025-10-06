import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { FragranceServices } from './fragrance.service';

const createFragrance = catchAsync(async (req, res) => {
  const result = await FragranceServices.createFragrance(req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Fragrance Created Successfully'
      : 'Fragrance Creation Failed',
    data: isok ? result : [],
  });
});

export const getAllFragrances = catchAsync(async (req, res) => {
  const result = await FragranceServices.getAllFragrances(req.query);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Fragrances Fetched Successfully'
      : 'Fragrances Fetching Failed',
    data: isok ? result : [],
  });
});

const getFragrance = catchAsync(async (req, res) => {
  const result = await FragranceServices.getFragrance(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Fragrance Fetched Successfully'
      : 'Fragrance Fetching Failed',
    data: isok ? result : [],
  });
});

const updateFragrance = catchAsync(async (req, res) => {
  const result = await FragranceServices.updateFragrance(req.params.id, req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Fragrance Updated Successfully'
      : 'Fragrance Updation Failed',
    data: isok ? result : [],
  });
});

const deleteFragrance = catchAsync(async (req, res) => {
  const result = await FragranceServices.deleteFragrance(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Fragrance Deleted Successfully'
      : 'Fragrance Deletion Failed',
    data: isok ? result : [],
  });
});

export const FragranceController = {
  createFragrance,
  getAllFragrances,
  getFragrance,
  updateFragrance,
  deleteFragrance,
};
