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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrderNotificationToAdmin = exports.sendOrderConfirmationEmail = exports.sendFeedbackEmail = exports.sendPasswordChangeNotificationEmail = exports.sendPasswordResetSuccessEmail = exports.sendPasswordResetEmail = exports.sendWelcomeEmail = exports.sendVerificationEmail = void 0;
const email_config_1 = require("../helpers/emailSender/email.config");
const emailTemplates_1 = require("../helpers/emailSender/emailTemplates");
const sendVerificationEmail = (to, token) => __awaiter(void 0, void 0, void 0, function* () {
    const template = emailTemplates_1.VERIFICATION_EMAIL_TEMPLATE.replace('{verificationCode}', token);
    const response = yield (0, email_config_1.sendEmail)([{ email: to }], 'Verify Your Account', template);
    return response;
});
exports.sendVerificationEmail = sendVerificationEmail;
const sendWelcomeEmail = (to, name) => __awaiter(void 0, void 0, void 0, function* () {
    const template = emailTemplates_1.WELCOME_EMAIL_TEMPLATE.replace('{name}', name);
    const response = yield (0, email_config_1.sendEmail)([{ email: to }], 'Welcome to Your App', template);
    return response;
});
exports.sendWelcomeEmail = sendWelcomeEmail;
//forgot password
const sendPasswordResetEmail = (to, resetURL) => __awaiter(void 0, void 0, void 0, function* () {
    const template = emailTemplates_1.PASSWORD_RESET_REQUEST_TEMPLATE.replace(/{resetURL}/g, resetURL);
    const response = yield (0, email_config_1.sendEmail)([{ email: to }], 'Password Reset Request', template);
    return response;
});
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const sendPasswordResetSuccessEmail = (to) => __awaiter(void 0, void 0, void 0, function* () {
    const template = emailTemplates_1.PASSWORD_RESET_SUCCESS_TEMPLATE;
    const response = yield (0, email_config_1.sendEmail)([{ email: to }], 'Password Reset Success', template);
    return response;
});
exports.sendPasswordResetSuccessEmail = sendPasswordResetSuccessEmail;
const sendPasswordChangeNotificationEmail = (to, name) => __awaiter(void 0, void 0, void 0, function* () {
    if (!to)
        return;
    const template = emailTemplates_1.PASSWORD_RESET_SUCCESS_TEMPLATE;
    try {
        return yield (0, email_config_1.sendEmail)([{ email: to }], 'Security Alert: Your Password Was Changed', template);
    }
    catch (error) {
        // Non-blocking: log so an email transport failure doesn't roll back the DB transaction
        console.error('Failed to send password change alert email:', error.message);
    }
});
exports.sendPasswordChangeNotificationEmail = sendPasswordChangeNotificationEmail;
const sendFeedbackEmail = (name, email, subject, message) => __awaiter(void 0, void 0, void 0, function* () {
    const template = emailTemplates_1.CONTACT_FORM_TEMPLATE.replace('{name}', name)
        .replace('{subject}', subject)
        .replace('{message}', message)
        .replace(/{email}/g, email);
    const response = yield (0, email_config_1.sendEmail)([{ email: 'azizultushar98@gmail.com' }], `New Contact Message: ${subject}`, template);
    console.log(`see response`, response);
    return response;
});
exports.sendFeedbackEmail = sendFeedbackEmail;
const sendOrderConfirmationEmail = (to, order) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const email = to ||
        ((_a = order === null || order === void 0 ? void 0 : order.shipping) === null || _a === void 0 ? void 0 : _a.email) ||
        ((_b = order === null || order === void 0 ? void 0 : order.billing) === null || _b === void 0 ? void 0 : _b.email) ||
        ((_c = order === null || order === void 0 ? void 0 : order.customerInfo) === null || _c === void 0 ? void 0 : _c.email) ||
        (order === null || order === void 0 ? void 0 : order.email);
    if (!email)
        return;
    const address = ((_d = order === null || order === void 0 ? void 0 : order.shipping) === null || _d === void 0 ? void 0 : _d.address) ||
        ((_e = order === null || order === void 0 ? void 0 : order.billing) === null || _e === void 0 ? void 0 : _e.address) ||
        ((_f = order === null || order === void 0 ? void 0 : order.customerInfo) === null || _f === void 0 ? void 0 : _f.address) ||
        (order === null || order === void 0 ? void 0 : order.address) ||
        'N/A';
    const district = ((_g = order === null || order === void 0 ? void 0 : order.shipping) === null || _g === void 0 ? void 0 : _g.district) ||
        ((_h = order === null || order === void 0 ? void 0 : order.customerInfo) === null || _h === void 0 ? void 0 : _h.district) ||
        (order === null || order === void 0 ? void 0 : order.district) ||
        '';
    const phone = ((_j = order === null || order === void 0 ? void 0 : order.shipping) === null || _j === void 0 ? void 0 : _j.phone) ||
        ((_k = order === null || order === void 0 ? void 0 : order.billing) === null || _k === void 0 ? void 0 : _k.phone) ||
        ((_l = order === null || order === void 0 ? void 0 : order.customerInfo) === null || _l === void 0 ? void 0 : _l.phone) ||
        (order === null || order === void 0 ? void 0 : order.phone) ||
        'N/A';
    const amount = Number((order === null || order === void 0 ? void 0 : order.amount) || 0);
    const invoice = String((order === null || order === void 0 ? void 0 : order.invoice) || 'N/A');
    const orderId = String((order === null || order === void 0 ? void 0 : order.id) || (order === null || order === void 0 ? void 0 : order._id) || 'N/A');
    // Accommodate both raw cartItems and populated Prisma orderItems
    const rawItems = (order === null || order === void 0 ? void 0 : order.orderItems) || (order === null || order === void 0 ? void 0 : order.cartItems) || [];
    const itemsHTML = rawItems
        .map((item) => {
        var _a, _b, _c;
        const img = ((_a = item.product) === null || _a === void 0 ? void 0 : _a.primaryImage) ||
            ((_b = item.productImageUrls) === null || _b === void 0 ? void 0 : _b[0]) ||
            item.primaryImage ||
            '';
        const name = ((_c = item.product) === null || _c === void 0 ? void 0 : _c.name) || item.productName || item.name || 'Product';
        const size = item.size ? `${item.size} ${item.unit || ''}`.trim() : item.selectedSize || 'Standard';
        const qty = item.quantity || 1;
        const price = Number(item.price || item.selectedPrice || 0);
        return `
        <li style="display: flex; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">
          ${img ? `<img src="${img}" alt="${name}" style="width: 55px; height: 55px; object-fit: cover; border-radius: 6px; margin-right: 12px; border: 1px solid #eee;" />` : ''}
          <div style="flex: 1;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #111;">${name}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Size: ${size}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Qty: ${qty} &times; ৳${price.toFixed(2)}</p>
          </div>
          <div style="font-weight: 700; color: #111; font-size: 13px;">
            ৳${(price * qty).toFixed(2)}
          </div>
        </li>`;
    })
        .join('');
    // Replace placeholders including invoice and orderId
    const template = emailTemplates_1.ORDER_CONFIRMATION_TEMPLATE
        .replace(/{invoice}/g, invoice)
        .replace(/{orderId}/g, orderId)
        .replace(/{email}/g, email)
        .replace(/{address}/g, address)
        .replace(/{district}/g, district)
        .replace(/{phone}/g, phone)
        .replace(/{amount}/g, amount.toFixed(2))
        .replace(/{items}/g, itemsHTML);
    try {
        return yield (0, email_config_1.sendEmail)([{ email }], `Order Confirmation - #${invoice}`, template);
    }
    catch (err) {
        console.error('Failed to dispatch order confirmation email:', err.message);
    }
});
exports.sendOrderConfirmationEmail = sendOrderConfirmationEmail;
const sendOrderNotificationToAdmin = (to, order) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, address, district, phone, amount, cartItems, date, note } = order;
    const orderId = String(order.invoice ? `${order.invoice} (${order.id || order._id})` : order.id || 'N/A');
    const itemsHTML = (cartItems || [])
        .map((item) => {
        var _a;
        return `
        <li style="display: flex; align-items: center; margin-bottom: 15px;">
          ${((_a = item.productImageUrls) === null || _a === void 0 ? void 0 : _a[0]) ? `<img src="${item.productImageUrls[0]}" alt="${item.productName}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px; margin-right: 15px;" />` : ''}
          <div>
            <p style="margin: 0 0 5px 0; font-weight: bold;">${item.productName}</p>
            <p style="margin: 0; font-size: 12px;">Size: ${item.size}</p>
            <p style="margin: 0; font-size: 12px;">Quantity: ${item.quantity}</p>
            <p style="margin: 0; font-size: 12px;">Unit Price: ৳${Number(item.price || 0).toFixed(2)}</p>
          </div>
        </li>`;
    })
        .join('');
    const template = emailTemplates_1.ORDER_NOTIFICATION_TO_ADMIN_TEMPLATE
        .replace(/{orderId}/g, orderId)
        .replace(/{email}/g, email || 'N/A')
        .replace(/{address}/g, address || 'N/A')
        .replace(/{district}/g, district || 'N/A')
        .replace(/{phone}/g, phone || 'N/A')
        .replace(/{date}/g, date || new Date().toLocaleDateString('en-GB'))
        .replace(/{note}/g, note || 'N/A')
        .replace(/{amount}/g, Number(amount || 0).toFixed(2))
        .replace(/{items}/g, itemsHTML);
    return yield (0, email_config_1.sendEmail)([{ email: to }], `New Order Received - #${order.invoice || order.id}`, template);
});
exports.sendOrderNotificationToAdmin = sendOrderNotificationToAdmin;
