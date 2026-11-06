import axios from 'axios';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

const BASE_URL = 'https://portal.packzy.com/api/v1';

const getHeaders = () => ({
  'Api-Key': process.env.STEADFAST_API_KEY,
  'Secret-Key': process.env.STEADFAST_SECRET_KEY,
  'Content-Type': 'application/json',
});

export const createSteadfastOrder = async (orderData: {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  note?: string;
  item_description?: string;
  total_lot?: number;
  weight?: string;
}) => {
  try {
    const response = await axios.post(`${BASE_URL}/create_order`, orderData, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error: any) {
    throw new AppError(
      error.response?.status || httpStatus.INTERNAL_SERVER_ERROR,
      error.response?.data?.message || 'Failed to create Steadfast order'
    );
  }
};

export const getSteadfastStatusByInvoice = async (invoiceId: string) => {
  try {
    const response = await axios.get(`${BASE_URL}/status_by_invoice/${invoiceId}`, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error: any) {
    throw new AppError(
      error.response?.status || httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch Steadfast status by invoice'
    );
  }
};

export const getSteadfastBalance = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/get_balance`, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error: any) {
    throw new AppError(
      error.response?.status || httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch Steadfast balance'
    );
  }
};