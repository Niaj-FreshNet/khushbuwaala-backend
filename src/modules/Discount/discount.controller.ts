// src/controllers/discount.controller.ts

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { DiscountServices } from "./discount.service";

const createDiscount = catchAsync(async (req, res) => {
  const result = await DiscountServices.createDiscount(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Discount created",
    data: result,
  });
});

const getAllAdmin = catchAsync(async (req, res) => {
  const result = await DiscountServices.getAllAdmin();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Discounts fetched",
    data: result,
  });
});

const getSingle = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await DiscountServices.getSingle(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Discount fetched",
    data: result,
  });
});

const updateDiscount = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await DiscountServices.updateDiscount(id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Discount updated",
    data: result,
  });
});

const deleteDiscount = catchAsync(async (req, res) => {
  const { id } = req.params;
  await DiscountServices.deleteDiscount(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Discount deleted",
  });
});

const applyDiscount = catchAsync(async (req, res) => {
  const { code, items } = req.body;
  const result = await DiscountServices.applyDiscount(code, items);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Discount applied",
    data: result,
  });
});

export const DiscountController = {
  createDiscount,
  getAllAdmin,
  getSingle,
  updateDiscount,
  deleteDiscount,
  applyDiscount,
};