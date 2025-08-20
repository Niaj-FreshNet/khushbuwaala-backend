import express from 'express';
import { AuthRoutes } from '../modules/Auth/auth.routes';
import { CategoryRoutes } from '../modules/Category/category.routes';
import { BlogRoutes } from '../modules/Blog/blog.routes';
import { ContactRoutes } from '../modules/contact/contact.routes';
import { MaterialRoutes } from '../modules/Material/material.routes';
import { ProductRoutes } from '../modules/Product/product.routes';
import { UserRoutes } from '../modules/User/user.routes';
import { PaymentRoutes } from '../modules/Payment/payment.routes';
import { OrderRoutes } from '../modules/Order/order.route';
import { ReviewRoutes } from '../modules/Review/review.routes';
import { OverviewRoutes } from '../modules/overview/overview.routes';
import { WishlistRoutes } from '../modules/Wishlist/wishlist.route';
import { SalesRoutes } from '../modules/Sale/sale.route';
import { ExpenseRoutes } from '../modules/Expense/expense.route';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/category',
    route: CategoryRoutes,
  },
  {
    path: '/materials',
    route: MaterialRoutes,
  },
  {
    path: '/products',
    route: ProductRoutes,
  },
  {
    path: '/blog',
    route: BlogRoutes,
  },
  {
    path: '/contact',
    route: ContactRoutes,
  },
  {
    path: '/user',
    route: UserRoutes,
  },
  {
    path: '/payment',
    route: PaymentRoutes,
  },
  {
    path: '/order',
    route: OrderRoutes,
  },
  {
    path: '/review',
    route: ReviewRoutes,
  },
  {
    path: '/overview',
    route: OverviewRoutes,
  },
  {
    path: '/wishlist',
    route: WishlistRoutes,
  },

  {
    path: '/sales',
    route: SalesRoutes,
  },
  {
    path: '/expense',
    route: ExpenseRoutes,
  },
];
moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
