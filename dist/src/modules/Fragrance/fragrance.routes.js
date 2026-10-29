"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FragranceRoutes = void 0;
const express_1 = require("express");
const fragrance_controller_1 = require("./fragrance.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = (0, express_1.Router)();
router.get('/get-all-fragrances', fragrance_controller_1.FragranceController.getAllFragrances);
router.post('/create-fragrance', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), fragrance_controller_1.FragranceController.createFragrance);
router.get('/get-fragrance/:id', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), fragrance_controller_1.FragranceController.getFragrance);
router.patch('/update-fragrance/:id', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), fragrance_controller_1.FragranceController.updateFragrance);
router.delete('/delete-fragrance/:id', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), fragrance_controller_1.FragranceController.deleteFragrance);
exports.FragranceRoutes = router;
