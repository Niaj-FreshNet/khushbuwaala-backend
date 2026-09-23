export interface IReview {
  rating: number;
  title: string;
  email?: string | null;
  comment: string;
  imageUrl?: string | null;
  productId: string;
  userId?: string | null;
  isPublished?: boolean;
}