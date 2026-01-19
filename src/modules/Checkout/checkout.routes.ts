import { Router } from "express";
import auth from "../../middlewares/auth";
import { CheckoutController } from "./checkout.controller";

const router = Router();

// Start payment
router.post("/bkash/create", auth("OPTIONAL"), CheckoutController.create);

// Callback must be public (bKash redirects back)
router.get("/bkash/callback", CheckoutController.callback);

// Refund (admin)
router.post("/bkash/refund/:trxID", auth("ADMIN", "SUPER_ADMIN"), CheckoutController.refund);

export const CheckoutRoutes = router;
