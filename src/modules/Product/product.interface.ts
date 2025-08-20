interface IProduct {
  name: string;
  description: string;
  imageUrl: string[];
  tags: string[];
  materialId: string;
  categoryId: string;
  published: boolean;
  variants: {
    size: string;
    color: string;
    price: number;
    quantity: number;
  }[];
}
