import { OrderSource, OrderStatus, SaleType } from "@prisma/client";

export type DashboardType = "all" | "website" | "manual";

export interface UpdateOrderPayload {
  status?: string;
  isPaid?: boolean;
  method?: string;
  orderSource?: OrderSource;
  saleType?: SaleType;
  shippingCost?: number;
  discountAmount?: number;
  coupon?: string | null;
  additionalNotes?: string | null;
  shipping?: any;
  billing?: any;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  amount?: number;
  customerId?: string | null;
  salesmanId?: string | null;
  // ✅ Add this line:
  orderItems?: Array<{
    id?: string;
    productId?: string;
    variantId?: string | null;
    size?: number;
    unit?: string;
    quantity?: number;
    price?: number;
  }>;
}