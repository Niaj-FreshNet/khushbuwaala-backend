import {
  sendOrderConfirmationEmail,
  sendOrderNotificationToAdmin,
} from '../../helpers/emailSender/emails';
import { prisma } from '../../../prisma/client';

const handleCheckoutSessionCompleted = async (session: any) => {
  console.log('Inside handleCheckoutSessionCompleted');
  const userId = session.metadata.userId;
  const cartItems = JSON.parse(session.metadata.cart); // [{ variantId, quantity }]

  // Fetch address, phone, note from metadata, with fallback to empty values
  const address = session.metadata.address
    ? JSON.parse(session.metadata.address)
    : {};
  const phone = session.metadata.phone || '';
  const zipcode = session.metadata.zipcode || '';
  const note = session.metadata.note || '';

  // Format address into string
  const formattedAddress = [
    address.line1 || '',
    address.line2 || '',
    address.city || '',
    address.country || '',
  ]
    .filter(Boolean)
    .join(', ');

  // Step 1: Extract variantIds
  const variantIds = cartItems.map((item: any) => item.variantId);

  // Step 2: Fetch variant details from DB (include product)
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  // Step 3: Merge variant + product details with quantity from cart
  const detailedCartItems = cartItems.map((item: any) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) {
      throw new Error(`Variant not found for ID: ${item.variantId}`);
    }
    return {
      variantId: variant.id,
      productId: variant.product.id,
      productName: variant.product.name,
      productImageUrls: variant.product.imageUrl,
      size: variant.size,
      color: variant.color,
      quantity: item.quantity,
      price: variant.price,
    };
  });

  const totalAmount = session.amount_total ? session.amount_total / 100 : 0;

  // Step 4: Save the order
  const order = await prisma.order.create({
    data: {
      customerId: userId,
      method: 'Stripe',
      email: session.customer_details.email,
      address: formattedAddress,
      phone,
      zipcode,
      note,
      amount: totalAmount,
      isPaid: true,
      cartItems: detailedCartItems,
    },
  });

  // Step 5: Reduce variant quantity and update product sales count
  for (const item of cartItems) {
    // Decrement variant quantity
    await prisma.productVariant.update({
      where: { id: item.variantId },
      data: {
        quantity: { decrement: item.quantity },
      },
    });

    // Increment product salesCount separately
    const variant = variants.find((v) => v.id === item.variantId);
    if (variant && variant.productId) {
      await prisma.product.update({
        where: { id: variant.productId },
        data: {
          salesCount: { increment: item.quantity },
        },
      });
    }
  }

  // Step 6: Send confirmation email (optional)
  await sendOrderConfirmationEmail(session.customer_details.email, {
    email: session.customer_details.email,
    id: order.id,
    date: new Date(order.createdAt).toLocaleDateString(),
    amount: totalAmount,
    address: formattedAddress,
    zipcode,
    phone,
    note,
    cartItems: detailedCartItems,
  });

  // step 7: send mail to admin
  await sendOrderNotificationToAdmin(process.env.ADMIN_EMAIL!, {
    email: session.customer_details.email,
    id: order.id,
    date: new Date(order.createdAt).toLocaleDateString(),
    amount: totalAmount,
    address: formattedAddress,
    zipcode,
    phone,
    note,
    cartItems: detailedCartItems,
  });
};

export const PaymentServices = { handleCheckoutSessionCompleted };
