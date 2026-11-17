import { Router } from 'express';
import { ExpenseController } from './expense.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Create an expense
router.post(
  '/create-expense',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  ExpenseController.createExpense
);

// Get all expenses (Supports pagination, sorting, date ranges, and filters)
router.get(
  '/get-all-expenses',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  ExpenseController.getAllExpenses
);

// Get expense by ID
router.get(
  '/get-expense-by-id/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  ExpenseController.getExpenseById
);

// Update expense status / payment status
router.patch(
  '/update-expense-status/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  ExpenseController.updateExpenseStatus
);

// Delete expense (Required for frontend single/bulk delete)
router.delete(
  '/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  ExpenseController.deleteExpense
);

// Analytics for expenses
router.get(
  '/get-expense-analytics',
  auth('ADMIN', 'SUPER_ADMIN'),
  ExpenseController.getExpenseAnalytics
);

export const ExpenseRoutes = router;