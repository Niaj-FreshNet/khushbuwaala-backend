export type TBkashCreatePaymentResponse = {
  statusCode: string;
  statusMessage: string;
  paymentID?: string;
  bkashURL?: string;
};

export type TBkashExecutePaymentResponse = {
  statusCode: string;
  statusMessage: string;
  paymentID?: string;
  trxID?: string;
  paymentExecuteTime?: string;
  amount?: string;
  transactionStatus?: string;
};

export type TBkashQueryPaymentResponse = {
  statusCode: string;
  statusMessage: string;
  paymentID?: string;
  transactionStatus?: "Initiated" | "Completed" | string;
  amount?: string;
  trxID?: string;
};
