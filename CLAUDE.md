# Khushbuwaala Backend (Express + Prisma + MongoDB)

API for Khushbuwaala Perfumes. Owner: Niaj (prefers plain language, simple analogies, structured explanations).

## Stack
Express, Prisma (MongoDB), custom `QueryBuilder`, `auth(...roles)` middleware (sets `req.user`; supports `'OPTIONAL'`).
Roles: USER, SALESMAN, ADMIN, SUPER_ADMIN, INVESTOR.

## Costing model
Variant `costPrice`, `ProductCost` (weighted average cost per unit), `VariantPackagingCost`, `StockPurchase`.
True cost = average liquid cost x size + packaging lines.

## Security rules (keep these)
- `costPrice` is only returned/editable for SUPER_ADMIN. Services take `isSuperAdmin`; controllers compute it from `req.user.role`.
- `quickUpdateCell` rejects `costPrice` edits from non-super-admins (403) before updating.
- `updateProduct` keeps existing variant cost (by SKU) unless the caller is SUPER_ADMIN.
- Public endpoints (`get-product-by-slug`, best sellers) must never include `costPrice`.
- `POST /:productId/variant-packaging-cost`, `POST /:productId/purchase` and Finance packaging routes are SUPER_ADMIN only.
- `create-product` requires ADMIN or SUPER_ADMIN.

## Product service notes
- `formatProductAdminListingResponse(product, isSuperAdmin)` returns `categoryId` + `category` + brand + variant extras (barcode, gtin, mpn, weightGrams, lowStockAlert).
- `updateProduct` updates variants in place (ids kept); public reads return published sizes only; hidden products 404 by slug.
- Stock is per product in liquid units (`Product.stock`, ml/gm). Orders/sales move it with atomic increment/decrement inside the transaction; `utils/orderStock.ts` makes returns happen exactly once (`Order.stockReturned`).
- Stock purchases with cost: `FinanceServices.addStockPurchaseAndUpdateWAC` (the only implementation; both purchase routes use it).

## Data rules (live MongoDB)
- One live database. Before filtering on a field, count documents where it is missing (`$exists: false`): a filter does not match a missing field even when Prisma has a default. For optional fields use `OR: [{ f: null }, { f: { isSet: false } }]`.
- Money is whole taka (Float fields; writes round). `Order.discountAmount` is Int.
- Dates: day filters are Bangladesh days (`utils/dhakaTime.ts`); analytics use Asia/Dhaka.

## Checks
`npx tsc --noEmit`, `npm run lint` (0 errors expected), `npm test` (node:test via ts-node, no database). `dist/` is not in git: the server builds it on deploy.
Admin app lives in `D:\Projects\khushbuwaala\khushbuwaala-admin`. Tracking docs: `D:\Projects\khushbuwaala\KHUSHBUWAALA_*.md`.
