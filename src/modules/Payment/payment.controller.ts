import Stripe from 'stripe';
import stripe from '../../config/stripe';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import catchAsync from '../../utils/catchAsync';
import { PaymentServices } from './payment.service';
import config from '../../config';
import sendResponse from '../../utils/sendResponse';

const createCheckoutSession = catchAsync(async (req, res) => {
  const { cart: cartItems, phone, address, zipcode, note } = req.body;
  const userId = req.user.id;

  // Get user email from DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) throw new AppError(404, 'User not found');

  // Extract variant IDs
  const variantIds = cartItems.map((item: any) => item.variantId);

  // Fetch variants and related products
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  if (!variants || variants.length !== cartItems.length) {
    throw new AppError(404, 'Some product variants not found');
  }

  // Quantity check
  // for (const item of cartItems) {
  //   const variant = variants.find((v) => v.id === item.variantId);
  //   if (!variant) {
  //     throw new AppError(404, `Variant not found for ID: ${item.variantId}`);
  //   }
  //   if (variant.quantity < item.quantity) {
  //     throw new AppError(
  //       400,
  //       `Insufficient stock for variant (Size: ${variant.size}, Color: ${variant.color}) of product "${variant.product.name}". Available: ${variant.quantity}, Requested: ${item.quantity}`,
  //     );
  //   }
  // }

  // Stripe line items
  const line_items = cartItems.map((item: any) => {
    const variant = variants.find((v) => v.id === item.variantId)!;
    return {
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(variant.price * 100),
        product_data: {
          // name: `${variant.product.name} (${variant.size} / ${variant.color})`,
          name: `${variant.product.name} (${variant.size})`,
          description: variant.product.description,
          images: [encodeURI(variant.product.primaryImage?.[0] ?? '')],
        },
      },
      quantity: item.quantity,
    };
  });

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: user.email,
    success_url: `${config.client_url}/success`,
    cancel_url: `${config.client_url}/cancel`,
    line_items,
    metadata: {
      userId,
      cart: JSON.stringify(cartItems),
      phone: phone || '',
      zipcode: zipcode || '',
      note: note || '',
      address: JSON.stringify(address || {}),
    },
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Checkout Session Created Successfully',
    data: { url: session.url },
  });
});

// Webhook
const webhook = catchAsync(async (req, res) => {
  console.log('webhook called!!');

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event = req.body as Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('Webhook verified:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res
      .status(400)
      .send(
        `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    return;
  }
  if (event.type === 'checkout.session.completed') {
    await PaymentServices.handleCheckoutSessionCompleted(
      event.data.object as Stripe.Checkout.Session,
    );
  }
  res.status(200).json({ status: 'success' });
});

const getAllPaymentHistory = catchAsync(async (req, res) => {
  // const userId = req.user.id;
  // const payments = await prisma.payment.findMany({
  //   where: {
  //     userId,
  //   },
  //   include: {
  //     user: true,
  //     products: true,
  //   },
  //   orderBy: {
  //     createdAt: 'desc',
  //   },
  // });
  // sendResponse(res, {
  //   statusCode: 200,
  //   success: true,
  //   message: 'Payment history retrieved successfully',
  //   Data: payments,
  // });
});

export const PaymentController = {
  createCheckoutSession,
  webhook,
  getAllPaymentHistory,
};
