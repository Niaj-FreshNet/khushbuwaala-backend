import { CostCategory } from '@prisma/client';

export interface ICostLineInput {
  category: CostCategory;
  label?: string;
  amount: number;
}

export interface IVariantPackagingCostInput {
  costLines: ICostLineInput[];
}

export interface IComboPackagingCostInput {
  costLines: ICostLineInput[];
}

export interface IStockPurchaseInput {
  productId: string;
  quantity: number;
  unit?: string;
  supplier?: string;
  billNo?: string;
  note?: string;
  costLines: ICostLineInput[];
  createdById?: string; 
}