export const makeInvoice = () => {
  const rnd = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `INV-${Date.now()}-${rnd}`;
};

export const getClientRedirects = () => {
  const success = process.env.BKASH_SUCCESS_REDIRECT || `${process.env.CLIENT_URL}/success`;
  const fail = process.env.BKASH_FAIL_REDIRECT || `${process.env.CLIENT_URL}/error`;
  return { success, fail };
};
