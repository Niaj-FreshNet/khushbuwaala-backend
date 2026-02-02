import axios, { AxiosInstance } from "axios";

type TokenCache = {
  idToken: string | null;
  refreshToken: string | null;
  expiresAtMs: number;
};

class BkashGatewayService {
  private http: AxiosInstance;
  private token: TokenCache = { idToken: null, refreshToken: null, expiresAtMs: 0 };

  constructor() {
    const baseURL = process.env.BKASH_BASE_URL;
    if (!baseURL) throw new Error("BKASH_BASE_URL missing");

    this.http = axios.create({
      baseURL,
      timeout: 30000, // bKash recommends default 30s timeout :contentReference[oaicite:9]{index=9}
    });
  }

  private credsHeaders() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: process.env.BKASH_USERNAME!,
      password: process.env.BKASH_PASSWORD!,
    };
  }

  private async grantToken() {
    const { data } = await this.http.post(
      "/tokenized/checkout/token/grant",
      {
        app_key: process.env.BKASH_API_KEY,
        app_secret: process.env.BKASH_SECRET_KEY,
      },
      { headers: this.credsHeaders() }
    );

    // docs: expires_in default 3600s :contentReference[oaicite:10]{index=10}
    const expiresInSec = Number(data.expires_in ?? 3600);
    this.token.idToken = data.id_token;
    this.token.refreshToken = data.refresh_token?.toString?.() ?? null;
    this.token.expiresAtMs = Date.now() + expiresInSec * 1000;

    return this.token.idToken!;
  }

  private async refreshToken() {
    const { data } = await this.http.post(
      "/tokenized/checkout/token/refresh",
      {
        app_key: process.env.BKASH_API_KEY,
        app_secret: process.env.BKASH_SECRET_KEY,
        refresh_token: this.token.refreshToken,
      },
      { headers: this.credsHeaders() }
    );

    const expiresInSec = Number(data.expires_in ?? 3600);
    this.token.idToken = data.id_token;
    this.token.refreshToken = data.refresh_token?.toString?.() ?? this.token.refreshToken;
    this.token.expiresAtMs = Date.now() + expiresInSec * 1000;

    return this.token.idToken!;
  }

  private async getIdToken() {
    // 60s safety
    if (this.token.idToken && Date.now() < this.token.expiresAtMs - 60_000) {
      return this.token.idToken;
    }
    if (this.token.refreshToken) {
      try {
        return await this.refreshToken(); // refresh endpoint :contentReference[oaicite:11]{index=11}
      } catch {
        return await this.grantToken(); // grant endpoint :contentReference[oaicite:12]{index=12}
      }
    }
    return await this.grantToken();
  }

  private async authHeaders() {
    const idToken = await this.getIdToken();
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: idToken, // id_token used as Authorization :contentReference[oaicite:13]{index=13}
      "X-App-Key": process.env.BKASH_API_KEY!,
    };
  }

  async createPayment(payload: {
    amount: number;
    callbackURL: string;
    payerReference: string;
    invoice: string;
  }) {
    const { data } = await this.http.post(
      "/tokenized/checkout/create",
      {
        mode: "0011", // URL checkout requires 0011 :contentReference[oaicite:14]{index=14}
        payerReference: payload.payerReference,
        callbackURL: payload.callbackURL, // base URL :contentReference[oaicite:15]{index=15}
        amount: payload.amount.toFixed(2),
        currency: "BDT",
        intent: "sale", // required :contentReference[oaicite:16]{index=16}
        merchantInvoiceNumber: payload.invoice,
      },
      { headers: await this.authHeaders() }
    );

    return data;
  }

  async executePayment(paymentID: string) {
    const { data } = await this.http.post(
      "/tokenized/checkout/execute",
      { paymentID }, // required :contentReference[oaicite:17]{index=17}
      { headers: await this.authHeaders() }
    );
    return data;
  }

  async queryPayment(paymentID: string) {
    const { data } = await this.http.post(
      "/tokenized/checkout/payment/status",
      { paymentID },
      { headers: await this.authHeaders() }
    );
    return data;
  }

  async refundTransaction(payload: {
    paymentId: string;
    trxId: string;
    refundAmount: number;
    sku: string;
    reason: string;
  }) {
    const { data } = await this.http.post(
      "/v2/tokenized-checkout/refund/payment/transaction", // refund URL :contentReference[oaicite:18]{index=18}
      {
        paymentId: payload.paymentId,
        trxId: payload.trxId,
        refundAmount: payload.refundAmount.toFixed(2),
        sku: payload.sku,
        reason: payload.reason,
      },
      { headers: await this.authHeaders() }
    );
    return data;
  }
}

export const bkashGateway = new BkashGatewayService();
