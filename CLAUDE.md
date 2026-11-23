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

## Code rules
- No `any` (lint error). Shared helpers: `types/index.d.ts` (`AuthUser`, `req.user`, `req.rawBody`), `types/records.ts` (row types, `asAddress()` for order address JSON), `utils/requestUser.ts` (`requireUser(req)` → user or 401), `utils/errorInfo.ts` (`errorMessage`, `httpErrorOf`), `utils/enumValue.ts` (`isEnumValue` for query strings), `utils/returnCharge.ts` (`parseOrderStatus`, `parseReturnCharge`).
- Query values are unchecked text: validate enums with `isEnumValue` before passing them to Prisma (an invalid value is a 500).
- Customer text going into email HTML goes through `esc()` in `emails.ts`. Contact form → `CONTACT_EMAIL` or `ADMIN_EMAIL`.
- DGePay: the callback's `transaction_id` is the gateway id (`Payment.gatewayPaymentId`), not our `Payment.id`.

## Checks
`npx tsc --noEmit`, `npm run lint` (0 problems; fails on any warning), `npm test` (node:test via ts-node, no database). `dist/` is not in git: the server builds it on deploy.
Admin app lives in `D:\Projects\khushbuwaala\khushbuwaala-admin`. Tracking docs: `D:\Projects\khushbuwaala\KHUSHBUWAALA_*.md`.

## Storefront-facing modules (2026-11-23)
- `modules/Discovery`: shop search/filters from an in-memory list (60 s, refreshed after product writes); taxonomy in `taxonomy.ts`. Public: `/api/discover`, `/suggest`, `/similar/:slug`, `/sitemap`.
- `modules/Wishlist`: signed-in user only; unique (userId, productId).
- `modules/Storefront`: owner-editable content (`storefront_settings`); `storefront.settings.ts` validates every save.
- Cart: a guest row is found only by its id (never by "no user"); cart rows are changed only by their owner or staff.
- Meta purchase event: `utils/metaPurchase.ts` (pure, tested); refusals are logged.
