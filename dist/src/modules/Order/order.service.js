"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderServices = void 0;
exports.sendMetaCapiPurchase = sendMetaCapiPurchase;
const client_1 = require("../../../prisma/client");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const crypto_1 = __importDefault(require("crypto"));
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_2 = require("@prisma/client");
const generateInvoice_1 = require("../../helpers/generateInvoice");
const discount_service_1 = require("../Discount/discount.service");
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
const emails_1 = require("../../helpers/emailSender/emails");
const getAllOrders = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const { searchTerm, status, payment, method, dateFrom, dateTo, productId } = queryParams, rest = __rest(queryParams, ["searchTerm", "status", "payment", "method", "dateFrom", "dateTo", "productId"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest, ['id', 'customer.name']);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = prismaQuery.where || {};
    if (searchTerm) {
        const s = String(searchTerm);
        where.OR = [
            ...(where.OR || []),
            { invoice: { contains: s, mode: "insensitive" } },
            { name: { contains: s, mode: "insensitive" } },
            { email: { contains: s, mode: "insensitive" } },
            { phone: { contains: s, mode: "insensitive" } },
            { method: { contains: s, mode: "insensitive" } },
        ];
    }
    if (status)
        where.status = status;
    if (payment === "PAID")
        where.isPaid = true;
    if (payment === "DUE")
        where.isPaid = false;
    if (method)
        where.method = String(method);
    if (dateFrom || dateTo) {
        where.orderTime = {};
        if (dateFrom)
            where.orderTime.gte = new Date(String(dateFrom));
        if (dateTo) {
            const end = new Date(String(dateTo));
            end.setHours(23, 59, 59, 999);
            where.orderTime.lte = end;
        }
    }
    if (productId) {
        where.productIds = { has: String(productId) };
    }
    const orders = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            customer: {
                select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true },
            },
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({ where: args.where }),
    });
    const normalizedOrders = orders.map((order) => {
        var _a, _b, _c, _d, _e;
        const customerData = (_a = order.customer) !== null && _a !== void 0 ? _a : {
            id: null,
            name: (_b = order.name) !== null && _b !== void 0 ? _b : null,
            phone: (_c = order.phone) !== null && _c !== void 0 ? _c : null,
            email: (_d = order.email) !== null && _d !== void 0 ? _d : null,
            address: (_e = order.address) !== null && _e !== void 0 ? _e : null,
            imageUrl: null,
        };
        return Object.assign(Object.assign({}, order), { customer: customerData });
    });
    return { meta, data: normalizedOrders };
});
const getOrderById = (idOrInvoice) => __awaiter(void 0, void 0, void 0, function* () {
    const param = String(idOrInvoice || "").trim();
    // A MongoDB ObjectId must be exactly 24 hexadecimal characters
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);
    const order = yield client_1.prisma.order.findFirst({
        where: isMongoId
            ? { OR: [{ id: param }, { invoice: param }] }
            : { invoice: param },
        include: {
            customer: { select: { id: true, name: true, imageUrl: true } },
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        },
    });
    if (!order)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    const customerData = order.customer || {
        id: null,
        name: order.name || null,
        phone: order.phone || null,
        email: order.email || null,
        address: order.address || null,
        imageUrl: null,
    };
    return Object.assign(Object.assign({}, order), { customer: customerData });
});
// ✅ Create Order with existing CartItems
const createOrderWithCartItems = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { customerId, payToken, cartItemIds, items, amount, isPaid, method, orderSource, saleType, shippingCost, additionalNotes, customerInfo, shippingAddress, billingAddress, coupon, discountAmount, } = payload;
    const rawEmail = ((_a = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) !== null && _a !== void 0 ? _a : "").trim().toLowerCase();
    // 1️⃣ Parallelize Cart Item fetching and user resolution
    const [dbCartItems, existingUser] = yield Promise.all([
        client_1.prisma.cartItem.findMany({
            where: {
                id: { in: cartItemIds },
                OR: [
                    { status: 'IN_CART' },
                    {
                        status: 'ORDERED',
                        order: {
                            isPaid: false,
                            method: { not: 'cashOnDelivery' }, // Never recycle or touch legitimate COD orders
                        },
                    },
                ],
            },
            include: {
                product: true,
                variant: true,
                order: { select: { id: true, isPaid: true, method: true } },
            },
        }),
        !customerId && rawEmail
            ? client_1.prisma.user.findFirst({
                where: { email: rawEmail },
                select: { id: true },
            })
            : null,
    ]);
    if (dbCartItems.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid cart items found.');
    }
    // 2️⃣ Resolve quantities and prices strictly from frontend payload with DB fallback
    const cartItems = items && items.length > 0 ? items.map((it) => {
        var _a, _b, _c, _d, _e, _f;
        const dbItem = dbCartItems.find((ci) => String(ci.id) === String(it.cartItemId) || ci.productId === it.productId);
        const resolvedQty = Math.max(1, Math.floor(Number(it.quantity || (dbItem === null || dbItem === void 0 ? void 0 : dbItem.quantity) || 1)));
        const resolvedPrice = Number((_b = (_a = it.price) !== null && _a !== void 0 ? _a : dbItem === null || dbItem === void 0 ? void 0 : dbItem.price) !== null && _b !== void 0 ? _b : 0);
        const resolvedOriginalPrice = Number((_d = (_c = it.originalPrice) !== null && _c !== void 0 ? _c : dbItem === null || dbItem === void 0 ? void 0 : dbItem.originalPrice) !== null && _d !== void 0 ? _d : resolvedPrice);
        const unitDiscount = Math.max(0, resolvedOriginalPrice - resolvedPrice);
        return {
            id: (dbItem === null || dbItem === void 0 ? void 0 : dbItem.id) || it.cartItemId || "",
            productId: String(it.productId || (dbItem === null || dbItem === void 0 ? void 0 : dbItem.productId) || ""),
            variantId: it.variantId || (dbItem === null || dbItem === void 0 ? void 0 : dbItem.variantId) || null,
            size: (dbItem === null || dbItem === void 0 ? void 0 : dbItem.size) || ((_e = dbItem === null || dbItem === void 0 ? void 0 : dbItem.variant) === null || _e === void 0 ? void 0 : _e.size) || null,
            unit: (dbItem === null || dbItem === void 0 ? void 0 : dbItem.unit) || ((_f = dbItem === null || dbItem === void 0 ? void 0 : dbItem.variant) === null || _f === void 0 ? void 0 : _f.unit) || null,
            quantity: resolvedQty,
            price: resolvedPrice,
            originalPrice: resolvedOriginalPrice,
            discount: unitDiscount,
            product: dbItem === null || dbItem === void 0 ? void 0 : dbItem.product,
            variant: dbItem === null || dbItem === void 0 ? void 0 : dbItem.variant,
        };
    }) : dbCartItems.map((ci) => {
        var _a, _b, _c, _d;
        return ({
            id: ci.id,
            productId: ci.productId,
            variantId: ci.variantId,
            size: ci.size || ((_a = ci.variant) === null || _a === void 0 ? void 0 : _a.size) || null,
            unit: ci.unit || ((_b = ci.variant) === null || _b === void 0 ? void 0 : _b.unit) || null,
            quantity: ci.quantity,
            price: Number(ci.price),
            originalPrice: Number((_c = ci.originalPrice) !== null && _c !== void 0 ? _c : ci.price),
            discount: Math.max(0, Number((_d = ci.originalPrice) !== null && _d !== void 0 ? _d : ci.price) - Number(ci.price)),
            product: ci.product,
            variant: ci.variant,
        });
    });
    const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
    const discount = Math.max(0, Number(discountAmount || 0));
    const shipping = Number(shippingCost || 0);
    const serverAmount = Math.max(0, subtotal) + shipping;
    const normalizeOrGuestEmail = (email) => {
        const e = (email !== null && email !== void 0 ? email : "").trim().toLowerCase();
        if (e)
            return e;
        return `guest+${Date.now()}-${Math.random().toString(16).slice(2)}@khushbuwaala.local`;
    };
    // 3️⃣ SAFE EMAIL CHECK
    let resolvedCustomerId = customerId || null;
    if (!resolvedCustomerId && rawEmail) {
        const existingUser = yield client_1.prisma.user.findFirst({
            where: { email: rawEmail },
            select: { id: true },
        });
        if (existingUser) {
            resolvedCustomerId = existingUser.id;
        }
    }
    // 3️⃣ Database Transaction (Batch queries with Promise.all)
    const order = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        // 🔄 ONLY revert items from aborted ONLINE checkout attempts
        const failedOnlineOrderIds = [
            ...new Set(dbCartItems
                .filter((ci) => ci.order && !ci.order.isPaid && ci.order.method !== 'cashOnDelivery')
                .map((ci) => ci.order.id)),
        ];
        if (failedOnlineOrderIds.length > 0) {
            yield Promise.all([
                ...dbCartItems
                    .filter((ci) => ci.order && !ci.order.isPaid && ci.order.method !== 'cashOnDelivery')
                    .map((ci) => {
                    var _a;
                    return tx.product.update({
                        where: { id: ci.productId },
                        data: {
                            salesCount: { decrement: ci.quantity || 1 },
                            stock: { increment: (((_a = ci.variant) === null || _a === void 0 ? void 0 : _a.size) || 0) * (ci.quantity || 1) },
                        },
                    });
                }),
                tx.order.updateMany({
                    where: { id: { in: failedOnlineOrderIds }, isPaid: false },
                    data: { status: 'CANCELED' },
                }),
            ]);
        }
        const invoice = yield (0, generateInvoice_1.generateInvoice)();
        // Ensure productIds array contains only valid strings
        const safeProductIds = cartItems.map((ci) => ci.productId).filter(Boolean);
        // Create Order:
        // - If method === 'cashOnDelivery', isPaid remains false, status is PENDING / PROCESSING
        // - If method === 'online', isPaid remains false until gateway callback marks COMPLETED
        const newOrder = yield tx.order.create({
            data: {
                invoice,
                payToken: payToken || null,
                amount: serverAmount,
                isPaid: false,
                method: method || "",
                orderSource: orderSource || 'WEBSITE',
                saleType: saleType || 'SINGLE',
                shippingCost: shipping,
                additionalNotes: additionalNotes || "",
                coupon: coupon ? String(coupon).trim().toUpperCase() : null,
                discountAmount: Number(discountAmount || 0),
                customer: resolvedCustomerId
                    ? { connect: { id: resolvedCustomerId } }
                    : {
                        create: {
                            name: (_a = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) !== null && _a !== void 0 ? _a : "",
                            phone: (_b = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) !== null && _b !== void 0 ? _b : "",
                            email: normalizeOrGuestEmail(customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email),
                            address: (_c = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) !== null && _c !== void 0 ? _c : "",
                        },
                    },
                shipping: {
                    name: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.name) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                    phone: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.phone) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                    email: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.email) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                    address: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.address) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                    district: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.district) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.district) || null,
                    thana: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.thana) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.thana) || null,
                    fbp: payload.fbp || null, // ✅ Store fbp
                    fbc: payload.fbc || null, // ✅ Store fbc
                },
                billing: {
                    name: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.name) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.name) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                    phone: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.phone) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.phone) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                    email: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.email) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.email) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                    address: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.address) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.address) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                    district: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.district) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.district) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.district) || null,
                    thana: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.thana) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.thana) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.thana) || null,
                },
                productIds: safeProductIds,
                cartItems: cartItems.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId || undefined,
                    size: item.size || null,
                    unit: item.unit || null,
                    quantity: item.quantity,
                    price: Number(item.price),
                })),
            },
        });
        // Update CartItems to ORDERED
        yield Promise.all(cartItems.map((item) => tx.cartItem.update({
            where: { id: item.id },
            data: {
                orderId: newOrder.id,
                status: 'ORDERED',
                quantity: item.quantity,
                price: Number(item.price),
                originalPrice: Number(item.originalPrice),
                discount: Number(item.discount),
            },
        })));
        // Decrement product inventory and create stock logs concurrently in parallel
        yield Promise.all([
            ...cartItems.map((item) => {
                var _a;
                const variantSize = ((_a = item.variant) === null || _a === void 0 ? void 0 : _a.size) || 0;
                const qty = item.quantity;
                return tx.product.update({
                    where: { id: item.productId },
                    data: {
                        salesCount: { increment: qty },
                        stock: { decrement: variantSize * qty },
                    },
                });
            }),
            ...cartItems.map((item) => {
                var _a;
                const variantSize = ((_a = item.variant) === null || _a === void 0 ? void 0 : _a.size) || 0;
                const qty = item.quantity;
                return tx.stockLog.create({
                    data: {
                        productId: item.productId,
                        variantId: item.variantId || '',
                        change: -(variantSize * qty),
                        reason: 'SALE',
                    },
                });
            }),
        ]);
        // If Cash on Delivery, consume coupon immediately
        if (coupon && method === "cashOnDelivery") {
            yield discount_service_1.DiscountServices.consumeDiscountUsageByCode(tx, coupon, newOrder.id);
        }
        return newOrder;
    }), { timeout: 15000 });
    // 5️⃣ Fetch populated order for frontend response and background processing
    const fullOrder = yield client_1.prisma.order.findUnique({
        where: { id: order.id },
        include: {
            customer: { select: { id: true, name: true, email: true, imageUrl: true } },
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        },
    });
    if (!fullOrder)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    const customerData = fullOrder.customer || {
        id: null,
        name: fullOrder.name || null,
        phone: fullOrder.phone || null,
        email: fullOrder.email || null,
        address: fullOrder.address || null,
        imageUrl: null,
    };
    const finalOrder = Object.assign(Object.assign({}, fullOrder), { customer: customerData });
    // 🚀 BACKGROUND TASKS (Non-blocking: emails and CAPI fire after response is sent)
    setImmediate(() => {
        var _a, _b, _c, _d, _e, _f;
        const customerEmail = ((_a = finalOrder.shipping) === null || _a === void 0 ? void 0 : _a.email) ||
            ((_b = finalOrder.billing) === null || _b === void 0 ? void 0 : _b.email) ||
            ((_c = finalOrder.customer) === null || _c === void 0 ? void 0 : _c.email) ||
            finalOrder.email;
        const customerPhone = ((_d = finalOrder.shipping) === null || _d === void 0 ? void 0 : _d.phone) ||
            ((_e = finalOrder.billing) === null || _e === void 0 ? void 0 : _e.phone) ||
            ((_f = finalOrder.customer) === null || _f === void 0 ? void 0 : _f.phone) ||
            finalOrder.phone;
        // ✅ 1. Dispatch emails & CAPI ONLY for Cash on Delivery immediately. 
        // Online payments (bKash/DGePay) will trigger CAPI and emails on successful payment callback/webhook verification.
        if (finalOrder.method === 'cashOnDelivery') {
            dispatchOrderEmails(finalOrder).catch((err) => console.error('❌ Failed to dispatch order emails:', err));
            sendMetaCapiPurchase(finalOrder, customerEmail, customerPhone);
        }
    });
    // ✅ Return full order so frontend & Redux store populate the Thank You page correctly
    return finalOrder;
});
const updateOrderStatus = (orderId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const order = yield client_1.prisma.order.update({
        where: { id: orderId },
        data: payload,
    });
    return order;
});
const updatePaymentStatus = (orderId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const isPaid = payload === null || payload === void 0 ? void 0 : payload.isPaid;
    if (typeof isPaid !== 'boolean') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'isPaid must be boolean');
    }
    const order = yield client_1.prisma.order.update({
        where: { id: orderId },
        data: { isPaid },
    });
    return order;
});
const cleanNumber = (v, field) => {
    if (v === undefined)
        return undefined;
    const n = Number(v);
    if (!Number.isFinite(n))
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `${field} must be a number`);
    return n;
};
const updateOrder = (orderId, payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const existing = yield client_1.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    const data = {};
    if (payload.status !== undefined)
        data.status = payload.status;
    if (payload.isPaid !== undefined) {
        if (typeof payload.isPaid !== 'boolean') {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'isPaid must be boolean');
        }
        data.isPaid = payload.isPaid;
    }
    if (payload.method !== undefined)
        data.method = (_a = payload.method) !== null && _a !== void 0 ? _a : null;
    if (payload.orderSource !== undefined)
        data.orderSource = payload.orderSource;
    if (payload.saleType !== undefined)
        data.saleType = payload.saleType;
    if (payload.shippingCost !== undefined)
        data.shippingCost = cleanNumber(payload.shippingCost, 'shippingCost');
    if (payload.discountAmount !== undefined)
        data.discountAmount = Math.max(0, Math.floor(Number(payload.discountAmount)));
    if (payload.coupon !== undefined)
        data.coupon = payload.coupon ? String(payload.coupon).trim().toUpperCase() : null;
    if (payload.additionalNotes !== undefined)
        data.additionalNotes = (_b = payload.additionalNotes) !== null && _b !== void 0 ? _b : null;
    if (payload.shipping !== undefined)
        data.shipping = payload.shipping;
    if (payload.billing !== undefined)
        data.billing = payload.billing;
    if (payload.name !== undefined)
        data.name = payload.name;
    if (payload.phone !== undefined)
        data.phone = payload.phone;
    if (payload.email !== undefined)
        data.email = payload.email;
    if (payload.address !== undefined)
        data.address = payload.address;
    if (payload.amount !== undefined) {
        const amt = cleanNumber(payload.amount, 'amount');
        if (amt <= 0)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'amount must be > 0');
        data.amount = amt;
    }
    if (payload.customerId !== undefined) {
        const role = user === null || user === void 0 ? void 0 : user.role;
        if (!['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(role)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Only ADMIN/SUPER_ADMIN/SALESMAN can change customer');
        }
        if (!payload.customerId) {
            data.customerId = null;
        }
        else {
            data.customer = { connect: { id: payload.customerId } };
        }
    }
    if (payload.salesmanId !== undefined)
        data.salesman = payload.salesmanId
            ? { connect: { id: payload.salesmanId } }
            : { disconnect: true };
    if (Object.keys(data).length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid fields provided to update');
    }
    const updated = yield client_1.prisma.order.update({
        where: { id: orderId },
        data,
        include: {
            customer: { select: { id: true, name: true, imageUrl: true, email: true, phone: true, address: true } },
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        },
    });
    const customerData = updated.customer || {
        id: null,
        name: updated.name || null,
        phone: updated.phone || null,
        email: updated.email || null,
        address: updated.address || null,
        imageUrl: null,
    };
    return Object.assign(Object.assign({}, updated), { customer: customerData });
});
const getUserOrders = (userId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const where = { customerId: userId };
    const [orders, totalOrders, totalAmount] = yield Promise.all([
        client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
                orderItems: {
                    include: {
                        product: { select: { id: true, name: true, primaryImage: true } },
                        variant: true,
                    },
                },
            } })),
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({ where, _sum: { amount: true } }),
    ]);
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({ where: args.where }),
    });
    return {
        meta,
        totalOrders,
        totalAmount: (_a = totalAmount._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data: orders,
    };
});
const getMyOrders = (userId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const user = yield client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    // Default limit to 200 so user orders are not truncated at 10
    const normalizedParams = Object.assign({ limit: "100" }, queryParams);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(normalizedParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const where = {
        OR: [
            { customerId: userId },
            ...((user === null || user === void 0 ? void 0 : user.email) ? [{ email: { equals: user.email, mode: "insensitive" } }] : []),
        ],
    };
    const [orders, totalOrders, totalAmount] = yield Promise.all([
        client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, orderBy: prismaQuery.orderBy || { createdAt: "desc" }, select: {
                id: true,
                invoice: true,
                status: true,
                isPaid: true,
                amount: true,
                shippingCost: true,
                orderTime: true,
                createdAt: true,
                orderItems: {
                    select: {
                        id: true,
                        quantity: true,
                        price: true,
                        product: { select: { id: true, name: true, primaryImage: true } },
                        variant: { select: { id: true, size: true, unit: true } },
                    },
                },
            } })),
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({ where, _sum: { amount: true } }),
    ]);
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({ where: args.where }),
    });
    return {
        meta,
        totalOrders,
        totalAmount: (_a = totalAmount._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data: orders,
    };
});
const getMyOrder = (userId, orderId) => __awaiter(void 0, void 0, void 0, function* () {
    const order = yield client_1.prisma.order.findFirst({
        where: { id: orderId, customerId: userId },
        include: {
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        },
    });
    if (!order)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    return order;
});
const getAllCustomers = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const customers = yield client_1.prisma.user.findMany(Object.assign(Object.assign({}, prismaQuery), { where: {
            customerOrders: {
                some: {},
            },
        }, select: {
            id: true,
            name: true,
            email: true,
            contact: true,
            address: true,
            imageUrl: true,
            _count: { select: { customerOrders: true } },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.user.count({
            where: {
                customerOrders: { some: {} },
            },
        }),
    });
    return { meta, data: customers };
});
const resolveOrderSourceWhere = (type) => {
    if (type === "website") {
        return { orderSource: client_2.OrderSource.WEBSITE };
    }
    if (type === "manual") {
        return {
            orderSource: {
                in: [client_2.OrderSource.MANUAL, client_2.OrderSource.SHOWROOM, client_2.OrderSource.WHOLESALE],
            },
        };
    }
    return {};
};
const buildLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = (0, date_fns_1.subDays)(new Date(), i);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        const key = d.toISOString().slice(0, 10);
        days.push({ key, label, date: d });
    }
    return days;
};
const TZ = "Asia/Dhaka";
const getDashboardMetrics = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (type = "all") {
    var _a, _b;
    const nowUtc = new Date();
    const nowDhaka = (0, date_fns_tz_1.toZonedTime)(nowUtc, TZ);
    const todayStartDhaka = (0, date_fns_1.startOfDay)(nowDhaka);
    const todayEndDhaka = (0, date_fns_1.endOfDay)(nowDhaka);
    const monthStartDhaka = (0, date_fns_1.startOfMonth)(nowDhaka);
    const todayStart = (0, date_fns_tz_1.fromZonedTime)(todayStartDhaka, TZ);
    const todayEnd = (0, date_fns_tz_1.fromZonedTime)(todayEndDhaka, TZ);
    const monthStart = (0, date_fns_tz_1.fromZonedTime)(monthStartDhaka, TZ);
    const sourceWhere = resolveOrderSourceWhere(type);
    const baseOrdersWhere = Object.assign(Object.assign({}, sourceWhere), { status: { not: "CANCELED" } });
    const baseSalesWhere = Object.assign(Object.assign({}, sourceWhere), { status: { not: "CANCELED" }, isPaid: true });
    const [todayOrders, monthOrders, monthSalesAgg, totalSalesAgg] = yield Promise.all([
        client_1.prisma.order.count({
            where: Object.assign(Object.assign({}, baseOrdersWhere), { orderTime: { gte: todayStart, lte: todayEnd } }),
        }),
        client_1.prisma.order.count({
            where: Object.assign(Object.assign({}, baseOrdersWhere), { orderTime: { gte: monthStart } }),
        }),
        client_1.prisma.order.aggregate({
            where: Object.assign(Object.assign({}, baseSalesWhere), { orderTime: { gte: monthStart } }),
            _sum: { amount: true },
        }),
        client_1.prisma.order.aggregate({
            where: baseSalesWhere,
            _sum: { amount: true },
        }),
    ]);
    return {
        type,
        todayOrders,
        monthOrders,
        monthSales: Number((_a = monthSalesAgg._sum.amount) !== null && _a !== void 0 ? _a : 0),
        totalSales: Number((_b = totalSalesAgg._sum.amount) !== null && _b !== void 0 ? _b : 0),
    };
});
const getWeeklySalesOverview = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (type = "all") {
    var _a;
    const last7 = buildLast7Days();
    const fromDhakaStart = (0, date_fns_1.startOfDay)(last7[0].date);
    const fromUtc = (0, date_fns_tz_1.fromZonedTime)(fromDhakaStart, TZ);
    const sourceWhere = resolveOrderSourceWhere(type);
    const orders = yield client_1.prisma.order.findMany({
        where: Object.assign(Object.assign({}, sourceWhere), { orderTime: { gte: fromUtc }, status: { not: "CANCELED" } }),
        select: {
            orderTime: true,
            amount: true,
            isPaid: true,
        },
    });
    const buckets = {};
    for (const d of last7)
        buckets[d.key] = { sales: 0, orders: 0 };
    for (const o of orders) {
        const oDhaka = (0, date_fns_tz_1.toZonedTime)(o.orderTime, TZ);
        const key = (0, date_fns_1.format)(oDhaka, "yyyy-MM-dd");
        if (!buckets[key])
            continue;
        buckets[key].orders += 1;
        if (o.isPaid)
            buckets[key].sales += Number((_a = o.amount) !== null && _a !== void 0 ? _a : 0);
    }
    return last7.map((d) => {
        var _a, _b, _c, _d;
        return ({
            day: d.label,
            sales: (_b = (_a = buckets[d.key]) === null || _a === void 0 ? void 0 : _a.sales) !== null && _b !== void 0 ? _b : 0,
            orders: (_d = (_c = buckets[d.key]) === null || _c === void 0 ? void 0 : _c.orders) !== null && _d !== void 0 ? _d : 0,
        });
    });
});
const trackOrders = (queryParam) => __awaiter(void 0, void 0, void 0, function* () {
    const param = String(queryParam || "").trim();
    if (!param)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Search query is required");
    const cleanDigits = param.replace(/\D/g, "");
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);
    // 1️⃣ Build MongoDB raw filter to search root fields AND nested JSON fields (shipping/billing)
    const rawOrConditions = [
        { invoice: { $regex: param, $options: "i" } },
        { email: { $regex: param, $options: "i" } },
        { "shipping.email": { $regex: param, $options: "i" } },
        { "billing.email": { $regex: param, $options: "i" } },
    ];
    if (isMongoId) {
        rawOrConditions.push({ _id: { $oid: param } });
    }
    // If user searched a phone number (e.g. at least 6 digits)
    if (cleanDigits.length >= 6) {
        rawOrConditions.push({ phone: { $regex: cleanDigits, $options: "i" } }, { "shipping.phone": { $regex: cleanDigits, $options: "i" } }, { "billing.phone": { $regex: cleanDigits, $options: "i" } });
    }
    // Find matching Order IDs using MongoDB's native JSON traversal
    const matchedOrdersRaw = (yield client_1.prisma.order.findRaw({
        filter: {
            $or: rawOrConditions,
        },
        options: {
            projection: { _id: 1 },
        },
    }));
    // Extract the matching 24-char hex ObjectIDs
    const matchedIds = (matchedOrdersRaw || [])
        .map((doc) => (typeof doc._id === "object" ? doc._id.$oid : doc._id))
        .filter(Boolean);
    if (matchedIds.length === 0) {
        return [];
    }
    // 2️⃣ Fetch the full relations (orderItems, products, variants, customer)
    const orders = yield client_1.prisma.order.findMany({
        where: {
            id: { in: matchedIds },
        },
        include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    imageUrl: true,
                },
            },
            orderItems: {
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            primaryImage: true,
                        },
                    },
                    variant: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    // 3️⃣ Normalize customer details so UI gets consistent fields
    return orders.map((order) => {
        const shippingJson = order.shipping || {};
        const billingJson = order.billing || {};
        const customerObj = order.customer || {};
        const resolvedName = shippingJson.name ||
            customerObj.name ||
            order.name ||
            "Valued Customer";
        const resolvedPhone = shippingJson.phone ||
            customerObj.phone ||
            order.phone ||
            "";
        const resolvedEmail = shippingJson.email ||
            customerObj.email ||
            order.email ||
            "";
        const resolvedAddress = shippingJson.address ||
            customerObj.address ||
            order.address ||
            "";
        return Object.assign(Object.assign({}, order), { name: resolvedName, phone: resolvedPhone, email: resolvedEmail, address: resolvedAddress, customer: {
                id: customerObj.id || null,
                name: resolvedName,
                phone: resolvedPhone,
                email: resolvedEmail,
                imageUrl: customerObj.imageUrl || null,
            } });
    });
});
const deleteOrder = (orderId) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield client_1.prisma.order.findUnique({
        where: { id: orderId },
    });
    if (!existing) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    }
    const result = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // 1️⃣ Delete associated cart items tied to this order
        yield tx.cartItem.deleteMany({
            where: { orderId },
        });
        // 2️⃣ Delete associated payment records to satisfy the 'OrderToPayment' relation constraint
        yield tx.payment.deleteMany({
            where: { orderId },
        });
        // 3️⃣ Now safely delete the order
        return yield tx.order.delete({
            where: { id: orderId },
        });
    }));
    return result;
});
// Helper function to send CAPI Purchase asynchronously (Zero impact on response speed)
function sendMetaCapiPurchase(order, customerEmail, customerPhone) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const pixelId = process.env.META_PIXEL_ID;
            const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
            if (!pixelId || !accessToken)
                return;
            const eventId = `kw_${order.id}`; // ✅ Must match frontend thank-you page event_id exactly
            const value = Number(order.amount || 0);
            const shipping = Number(order.shippingCost || 0);
            const items = (order.orderItems || []).map((it) => {
                var _a;
                return ({
                    id: String(it.productId || ((_a = it.product) === null || _a === void 0 ? void 0 : _a.id) || ""),
                    quantity: Math.max(1, Number(it.quantity || 1)),
                    item_price: Number(it.price || 0),
                });
            });
            const shippingInfo = order.shipping || {};
            const payload = Object.assign(Object.assign({}, (process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {})), { data: [
                    {
                        event_name: "Purchase",
                        event_time: Math.floor(Date.now() / 1000),
                        event_id: eventId,
                        event_source_url: `${process.env.CLIENT_URL || "https://khushbuwaala.com"}/thank-you`,
                        action_source: "website",
                        user_data: {
                            em: customerEmail ? [crypto_1.default.createHash("sha256").update(customerEmail.trim().toLowerCase()).digest("hex")] : undefined,
                            ph: customerPhone ? [crypto_1.default.createHash("sha256").update(customerPhone.replace(/\D/g, "")).digest("hex")] : undefined,
                            fn: shippingInfo.name ? [crypto_1.default.createHash("sha256").update(shippingInfo.name.trim().toLowerCase()).digest("hex")] : undefined,
                            ct: shippingInfo.district ? [crypto_1.default.createHash("sha256").update(shippingInfo.district.trim().toLowerCase()).digest("hex")] : undefined,
                            country: ["bd"],
                            fbp: shippingInfo.fbp || undefined, // ✅ Passed from client cookie
                            fbc: shippingInfo.fbc || undefined, // ✅ Passed from client cookie
                        },
                        custom_data: {
                            currency: "BDT",
                            value: value,
                            shipping: shipping,
                            order_id: order.id,
                            contents: items,
                            content_type: "product",
                        },
                    },
                ] });
            yield fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        }
        catch (e) {
            console.error("❌ CAPI Build Error:", e);
        }
    });
}
function dispatchOrderEmails(fullOrder) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const customerEmail = ((_a = fullOrder.shipping) === null || _a === void 0 ? void 0 : _a.email) ||
            ((_b = fullOrder.billing) === null || _b === void 0 ? void 0 : _b.email) ||
            ((_c = fullOrder.customer) === null || _c === void 0 ? void 0 : _c.email) ||
            fullOrder.email;
        const customerPhone = ((_d = fullOrder.shipping) === null || _d === void 0 ? void 0 : _d.phone) ||
            ((_e = fullOrder.billing) === null || _e === void 0 ? void 0 : _e.phone) ||
            ((_f = fullOrder.customer) === null || _f === void 0 ? void 0 : _f.phone) ||
            fullOrder.phone;
        if (customerEmail && !customerEmail.includes('@khushbuwaala.local')) {
            (0, emails_1.sendOrderConfirmationEmail)(customerEmail, fullOrder).catch((err) => console.error('❌ Failed to send order confirmation email to customer:', err.message));
        }
        const adminEmail = process.env.ADMIN_EMAIL || 'khushbuwaala@gmail.com';
        if (adminEmail) {
            (0, emails_1.sendOrderNotificationToAdmin)(adminEmail, Object.assign(Object.assign({}, fullOrder), { email: customerEmail || 'N/A', address: ((_g = fullOrder.shipping) === null || _g === void 0 ? void 0 : _g.address) || fullOrder.address || 'N/A', district: ((_h = fullOrder.shipping) === null || _h === void 0 ? void 0 : _h.district) || '', phone: customerPhone || 'N/A', date: new Date().toLocaleDateString('en-GB'), note: fullOrder.additionalNotes || 'N/A', cartItems: (fullOrder.orderItems || []).map((oi) => {
                    var _a, _b, _c;
                    return ({
                        productName: ((_a = oi.product) === null || _a === void 0 ? void 0 : _a.name) || 'Product',
                        productImageUrls: [((_b = oi.product) === null || _b === void 0 ? void 0 : _b.primaryImage) || ''],
                        size: ((_c = oi.variant) === null || _c === void 0 ? void 0 : _c.size) ? `${oi.variant.size} ${oi.variant.unit || ''}`.trim() : 'Standard',
                        quantity: oi.quantity,
                        price: Number(oi.price || 0),
                    });
                }) })).catch((err) => console.error('❌ Failed to send order notification email to admin:', err.message));
        }
    });
}
exports.OrderServices = {
    getAllOrders,
    getOrderById,
    createOrderWithCartItems,
    updateOrderStatus,
    updatePaymentStatus,
    updateOrder,
    getUserOrders,
    getMyOrders,
    getMyOrder,
    getAllCustomers,
    getDashboardMetrics,
    getWeeklySalesOverview,
    trackOrders,
    deleteOrder,
};
