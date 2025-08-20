export interface IBlog {
  userId: string;
  title: string;
  content: string;
  imageUrl: string;
  others?: string;
  isPublish?: boolean;
}
