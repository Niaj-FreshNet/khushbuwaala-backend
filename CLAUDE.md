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
- Known, not fixed: `updateProduct` recreates variants (new ids) and resets `lowStockAlert`; `get-product/:id` returns unpublished variants publicly.

## Not verified yet
Backend `npx tsc --noEmit` has not been run since these changes. Admin app lives in `D:\Projects\khushbuwaala-admin`.
