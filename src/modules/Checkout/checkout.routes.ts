import { Router } from "express";
import auth from "../../middlewares/auth";
import { CheckoutController } from "./checkout.controller";

const router = Router();

// DGePay Gateway Routes
router.post("/dgepay/create", auth("OPTIONAL"), CheckoutController.createDgepay);
router.all("/dgepay/callback", CheckoutController.callbackDgepay);

export const CheckoutRoutes = router;