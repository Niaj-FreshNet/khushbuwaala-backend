import { EXPENSE_CATEGORIES } from './expense.constant';
import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ExpenseServices } from './expense.service';

const createExpense = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const userId = req.user.id;
  const result = await ExpenseServices.createExpense(payload, userId);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expense added successfully' : 'Expense creation failed',
    data: result ?? null,
  });
});

const getAllExpenses = catchAsync(async (req: Request, res: Response) => {
  const result = await ExpenseServices.getAllExpenses(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Expenses fetched successfully',
    data: result,
  });
});

const getExpenseById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ExpenseServices.getExpenseById(id);

  sendResponse(res, {
    statusCode: result ? 200 : 404,
    success: !!result,
    message: result ? 'Expense fetched successfully' : 'Expense not found',
    data: result ?? null,
  });
});

const updateExpenseStatus = catchAsync(async (req: Request, res: Response) => {
  const expenseId = req.params.id;
  const payload = req.body;
  const result = await ExpenseServices.updateExpenseStatus(expenseId, payload);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expense status updated successfully' : 'Failed to update expense status',
    data: result ?? null,
  });
});

const updateExpense = catchAsync(async (req: Request, res: Response) => {
  const result = await ExpenseServices.updateExpense(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Expense updated successfully', data: result });
});

const getExpenseCategories = catchAsync(async (_req: Request, res: Response) => {
  sendResponse(res, { statusCode: 200, success: true, message: 'Expense categories', data: EXPENSE_CATEGORIES });
});

const deleteExpense = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ExpenseServices.deleteExpense(id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Expense deleted successfully',
    data: result,
  });
});

const getExpenseAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await ExpenseServices.getExpenseAnalytics(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Expense analytics fetched successfully',
    data: result,
  });
});

export const ExpenseController = {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpenseStatus,
  updateExpense,
  getExpenseCategories,
  deleteExpense,
  getExpenseAnalytics,
};