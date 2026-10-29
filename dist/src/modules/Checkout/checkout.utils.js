"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientRedirects = exports.makeInvoice = void 0;
const makeInvoice = () => {
    const rnd = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `INV-${Date.now()}-${rnd}`;
};
exports.makeInvoice = makeInvoice;
const getClientRedirects = () => {
    const success = process.env.BKASH_SUCCESS_REDIRECT || `${process.env.CLIENT_URL}/success`;
    const fail = process.env.BKASH_FAIL_REDIRECT || `${process.env.CLIENT_URL}/error`;
    return { success, fail };
};
exports.getClientRedirects = getClientRedirects;
