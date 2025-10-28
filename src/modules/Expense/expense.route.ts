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

// Get all expenses (admin overview)
router.get(
  '/get-all-expenses',
  auth('ADMIN', 'SUPER_ADMIN'),
  ExpenseController.getAllExpenses
);

// Get expense by ID
router.get(
  '/get-expense-by-id/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  ExpenseController.getExpenseById
);

// Update expense status
router.patch(
  '/update-expense-status/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  ExpenseController.updateExpenseStatus
);

// Analytics for expenses
router.get(
  '/get-expense-analytics',
  auth('ADMIN', 'SUPER_ADMIN'),
  ExpenseController.getExpenseAnalytics
);

export const ExpenseRoutes = router;