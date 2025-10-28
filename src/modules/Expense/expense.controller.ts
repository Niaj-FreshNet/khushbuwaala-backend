import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ExpenseServices } from './expense.service';

// Create an expense
const createExpense = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const userId = req.user.id; // ADMIN or SUPER_ADMIN creating the expense
  const result = await ExpenseServices.createExpense(payload, userId);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expense added successfully' : 'Expense creation failed',
    data: result ?? null,
  });
});

// Get all expenses
const getAllExpenses = catchAsync(async (req: Request, res: Response) => {
  const result = await ExpenseServices.getAllExpenses(req.query);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expenses fetched successfully' : 'Failed to fetch expenses',
    data: result ?? [],
  });
});

// Get expense by ID
const getExpenseById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ExpenseServices.getExpenseById(id);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expense fetched successfully' : 'Expense not found',
    data: result ?? null,
  });
});

// Update expense status
const updateExpenseStatus = catchAsync(async (req: Request, res: Response) => {
  const expenseId = req.params.id;
  const payload = req.body; // e.g., { status: "COMPLETED" }
  const result = await ExpenseServices.updateExpenseStatus(expenseId, payload);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expense status updated successfully' : 'Failed to update expense status',
    data: result ?? null,
  });
});

// Expense analytics
const getExpenseAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await ExpenseServices.getExpenseAnalytics(req.query);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Expense analytics fetched successfully' : 'Failed to fetch analytics',
    data: result ?? {},
  });
});

export const ExpenseController = {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpenseStatus,
  getExpenseAnalytics,
};