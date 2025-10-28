export interface IBlog {
  userId: string;
  title: string;
  content: string;
  imageUrl: string;
  imageAltText?: string;
  others?: string;
  isPublish?: boolean;
  metaTitle?: string; // SEO title (60-70 chars)
  metaDescription?: string; // SEO description (150-160 chars)
  keywords?: string; // Comma-separated keywords
  slug?: string;
}