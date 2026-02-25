import { OrderSource, OrderStatus, SaleType } from "@prisma/client";

export type DashboardType = "all" | "website" | "manual";

export type UpdateOrderPayload = {
  // common editable fields
  status?: OrderStatus;
  isPaid?: boolean;
  method?: string | null;

  orderSource?: OrderSource;
  saleType?: SaleType;

  shippingCost?: number;
  additionalNotes?: string | null;

  coupon?: string | null;
  discountAmount?: number;

  // addresses (stored as Json)
  shipping?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    district?: string | null;
    thana?: string | null;
  } | null;

  billing?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    district?: string | null;
    thana?: string | null;
  } | null;

  // manual sales fields
  salesmanId?: string | null;

  // optional walk-in fields (for MANUAL / showroom order)
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;

  // if you REALLY want admin to override amount
  amount?: number;

  // optional: move order to a different customer (admin only)
  customerId?: string | null;
};