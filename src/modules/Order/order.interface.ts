import { OrderSource, SaleType } from "@prisma/client";
import type { AddressJson } from '../../types/records';

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
  shipping?: AddressJson;
  billing?: AddressJson;
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