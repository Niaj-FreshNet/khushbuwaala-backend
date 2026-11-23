
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
