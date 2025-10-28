export interface IReview {
  rating: number;
  title: string;
  comment: string;
  productId: string;
  isPublished?: boolean;
}
