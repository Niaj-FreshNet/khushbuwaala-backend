import { Prisma } from '@prisma/client';
import { NestedFilter, rangeFilteringParams } from '../../helpers/queryBuilder';

// Basic filtering fields for orders
export const orderFilterFields: string[] = [
    'status',
    'paymentStatus',
    'paymentMethod'
];

// Searchable fields (for admin panel / reporting)
export const orderSearchFields: string[] = [
    'id',
    'orderNumber',
    'customerName',
    'customerEmail',
    'customerPhone'
];

// Nested filters for related fields
export const orderNestedFilters: NestedFilter[] = [
    {
        key: 'customer',
        searchOption: 'exact',
        queryFields: ['name', 'email', 'phone']
    },
    {
        key: 'salesman',
        searchOption: 'exact',
        queryFields: ['name', 'email']
    },
    {
        key: 'items',
        queryFields: ['productName', 'sku']
    }
];

// Range filters for analytics
export const orderRangeFilter: rangeFilteringParams[] = [
    {
        field: 'totalAmount',
        maxQueryKey: 'maxTotal',
        minQueryKey: 'minTotal',
        dataType: 'number',
    },
    {
        field: 'createdAt',
        maxQueryKey: 'endDate',
        minQueryKey: 'startDate',
        dataType: 'date',
    }
];

// Prisma include config for order queries
export const orderInclude: Prisma.OrderInclude = {
    customer: {
        select: {
            id: true,
            name: true,
            email: true,
            contact: true
        }
    },
    salesman: {
        select: {
            id: true,
            name: true,
            email: true
        }
    },
    orderItems: {
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    primaryImage: true,
                    discounts: true, // product-level discounts
                }
            },
            variant: {
                include: {
                    discounts: true // variant-level discounts
                }
            }
        }
    },
    orderDiscounts: {
        include: {
            discount: true // include discount details
        }
    },
    payments: true // include payments for this order
};

// Sort options mapping
export const orderSortOptions = {
    newest: { createdAt: 'desc' },
    oldest: { createdAt: 'asc' },
    amount_asc: { totalAmount: 'asc' },
    amount_desc: { totalAmount: 'desc' },
    status: { status: 'asc' }
} as const;

// Order status constants
export const ORDER_STATUSES = [
    'PENDING',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED'
] as const;

// Payment methods
export const PAYMENT_METHODS = [
    'CASH_ON_DELIVERY',
    'CREDIT_CARD',
    'BANK_TRANSFER',
    'MOBILE_PAYMENT'
] as const;

// Payment status
export const PAYMENT_STATUSES = [
    'PENDING',
    'PAID',
    'FAILED',
    'REFUNDED'
] as const;

// Validation constants
export const ORDER_VALIDATION = {
    MIN_TOTAL_AMOUNT: 0.01,
    MAX_TOTAL_AMOUNT: 999999,
    MAX_ITEMS: 100,
    MAX_DISCOUNT: 100, // percentage
    MAX_NOTE_LENGTH: 1000
} as const;

// Query defaults
export const QUERY_DEFAULTS = {
    PAGE: 1,
    LIMIT: 20,
    MAX_LIMIT: 100,
    RECENT_ORDERS_LIMIT: 10
} as const;

// Cache keys
export const CACHE_KEYS = {
    ALL_ORDERS: 'orders:all',
    RECENT_ORDERS: 'orders:recent',
    ORDER_STATS: 'orders:stats',
    CUSTOMER_ORDERS: 'orders:customer',
} as const;

// Error messages
export const ORDER_ERROR_MESSAGES = {
    NOT_FOUND: 'Order not found',
    INVALID_STATUS: 'Invalid order status provided',
    INVALID_PAYMENT_METHOD: 'Invalid payment method provided',
    INVALID_PAYMENT_STATUS: 'Invalid payment status provided',
    EMPTY_ORDER: 'Order must contain at least one item',
    INSUFFICIENT_STOCK: 'Insufficient stock for one or more items',
    CUSTOMER_REQUIRED: 'Customer information is required',
    MAX_ITEMS_EXCEEDED: 'Order exceeds maximum allowed items',
    TOTAL_AMOUNT_INVALID: 'Total amount is invalid',
    STATUS_UPDATE_FAILED: 'Order status update failed',
} as const;

export default {
    orderFilterFields,
    orderSearchFields,
    orderNestedFilters,
    orderRangeFilter,
    orderInclude,
    orderSortOptions,
    ORDER_STATUSES,
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    ORDER_VALIDATION,
    QUERY_DEFAULTS,
    CACHE_KEYS,
    ORDER_ERROR_MESSAGES
};
