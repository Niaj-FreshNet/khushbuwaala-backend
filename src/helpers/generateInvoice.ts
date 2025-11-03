import { prisma } from "../../prisma/client";

export const generateInvoice = async (): Promise<string> => {
  let unique = false;
  let invoice = "";

  while (!unique) {
    // Generate a random 5–7 digit number
    const randomNum = Math.floor(10000 + Math.random() * 900000).toString();

    // Check if it already exists
    const existing = await prisma.order.findUnique({
      where: { invoice: randomNum },
      select: { id: true },
    });

    if (!existing) {
      invoice = randomNum;
      unique = true;
    }
  }

  return invoice;
};
