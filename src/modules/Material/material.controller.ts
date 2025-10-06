import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { MaterialServices } from './material.service';

const createMaterial = catchAsync(async (req, res) => {
  const result = await MaterialServices.createMaterial(req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Material Created Successfully'
      : 'Material Creation Failed',
    data: isok ? result : [],
  });
});

export const getAllMaterials = catchAsync(async (req, res) => {
  const result = await MaterialServices.getAllMaterials(req.query);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Materials Fetched Successfully'
      : 'Materials Fetching Failed',
    data: isok ? result : [],
  });
});

const getMaterial = catchAsync(async (req, res) => {
  const result = await MaterialServices.getMaterial(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Material Fetched Successfully'
      : 'Material Fetching Failed',
    data: isok ? result : [],
  });
});

const updateMaterial = catchAsync(async (req, res) => {
  const result = await MaterialServices.updateMaterial(req.params.id, req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Material Updated Successfully'
      : 'Material Updation Failed',
    data: isok ? result : [],
  });
});

const deleteMaterial = catchAsync(async (req, res) => {
  const result = await MaterialServices.deleteMaterial(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Material Deleted Successfully'
      : 'Material Deletion Failed',
    data: isok ? result : [],
  });
});

export const MaterialController = {
  createMaterial,
  getAllMaterials,
  getMaterial,
  updateMaterial,
  deleteMaterial,
};
