// src/routes/discount.route.ts
import { Router } from "express";
import auth from "../../middlewares/auth";
import { DiscountController } from "./discount.controller";

const router = Router();

router.post("/create", auth("ADMIN", "SUPER_ADMIN"), DiscountController.createDiscount);
router.get("/admin", auth("ADMIN", "SUPER_ADMIN"), DiscountController.getAllAdmin);
router.get("/:id", auth("ADMIN", "SUPER_ADMIN"), DiscountController.getSingle);
router.patch("/:id", auth("ADMIN", "SUPER_ADMIN"), DiscountController.updateDiscount);
router.delete("/:id", auth("ADMIN", "SUPER_ADMIN"), DiscountController.deleteDiscount);

// Public endpoint – no auth (used by checkout)
router.post("/apply", DiscountController.applyDiscount);

export const DiscountRoutes = router;