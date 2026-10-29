"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutRoutes = void 0;
const express_1 = require("express");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const checkout_controller_1 = require("./checkout.controller");
const router = (0, express_1.Router)();
// DGePay Gateway Routes
router.post("/dgepay/create", (0, auth_1.default)("OPTIONAL"), checkout_controller_1.CheckoutController.createDgepay);
router.all("/dgepay/callback", checkout_controller_1.CheckoutController.callbackDgepay);
exports.CheckoutRoutes = router;
