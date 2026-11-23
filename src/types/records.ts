// Database rows as the services load them: the Prisma model plus whichever relations were included.
// Relations are optional because each query includes a different set.
import type {
  CartItem,
  Category,
  Discount,
  Fragrance,
  Material,
  Order,
  OrderItemCost,
  Product,
  ProductVariant,
  Review,
  User,
} from '@prisma/client';

// Lean listings select only some columns, so related rows are partial (id and price are always there).
export type ReviewRow = Partial<Review> & Pick<Review, 'rating'> & { user?: Pick<User, 'name' | 'imageUrl'> | null };

export type VariantRow = Partial<ProductVariant> & Pick<ProductVariant, 'id' | 'price'> & { discounts?: Partial<Discount>[] };

export type DiscountRow = Pick<Discount, 'type' | 'value'> & Partial<Discount>;

export type ProductRow = Product & {
  variants?: VariantRow[];
  Review?: ReviewRow[];
  discounts?: DiscountRow[];
  category?: Partial<Category> | null;
  // sometimes loaded with the material/fragrance, sometimes just the link ids
  ProductMaterial?: { material?: Material | null; materialId?: string }[];
  ProductFragrance?: { fragrance?: Fragrance | null; fragranceId?: string }[];
};

export type OrderLineRow = CartItem & {
  product?: Pick<Product, 'id' | 'name'> & Partial<Pick<Product, 'primaryImage' | 'slug'>> | null;
  variant?: ProductVariant | null;
};

export type OrderRow = Order & {
  orderItems?: OrderLineRow[];
  orderItemCosts?: Partial<OrderItemCost>[];
  // the linked account, or the fallback built from the name/phone typed on the order
  customer?: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null; address?: string | null; imageUrl?: string | null } | null;
};

/** The shipping / billing JSON on an order */
export type AddressJson = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  district?: string | null;
  thana?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

/** Read an order's shipping/billing JSON safely (it can be null or, on old orders, missing fields) */
export const asAddress = (json: unknown): AddressJson =>
  json && typeof json === 'object' && !Array.isArray(json) ? (json as AddressJson) : {};
