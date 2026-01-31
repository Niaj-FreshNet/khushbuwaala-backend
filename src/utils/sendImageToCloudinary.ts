import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

// ✅ Multer memory storage for in-memory buffer
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Reusable upload function
export const uploadToCloudinary = async (
  file: Express.Multer.File,
  folderPath: string = 'khushbuwaala_images/default',        // e.g., categories, products, materials
  publicIdPrefix: string = 'file',   // e.g., category, product
  convertToWebp: boolean = true
): Promise<{ location: string }> => {
  try {
    if (!file.buffer) throw new Error('File buffer is missing');

    // Convert buffer to base64
    const base64String = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(base64String, {
      folder: folderPath,
      public_id: `${publicIdPrefix}-${Date.now()}`, // unique name
      format: convertToWebp ? 'webp' : undefined,
      resource_type: 'image',
    });

    return { location: result.secure_url };
  } catch (error: any) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

// ✅ Reusable delete function
export const deleteFromCloudinary = async (fileUrl: string) => {
  try {
    const parts = fileUrl.split('/');
    const folder = parts[parts.length - 2];
    const filename = parts[parts.length - 1].split('.')[0];
    const publicId = `${folder}/${filename}`;

    await cloudinary.uploader.destroy(publicId);
  } catch (error: any) {
    throw new Error(`Cloudinary delete failed: ${error.message}`);
  }
};

/**
 * ✅ IMPORTANT: delete using public_id (best)
 * If you only have URL, we can try to derive public_id, but it can break if structure changes.
 */
export const deleteFromCloudinaryByPublicId = async (publicId: string) => {
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
};

// fallback (URL-based, less reliable)
export const getPublicIdFromCloudinaryUrl = (url: string) => {
  // https://res.cloudinary.com/<cloud>/image/upload/v12345/folder/name.webp
  const parts = url.split("/upload/");
  if (parts.length < 2) return null;
  const afterUpload = parts[1];               // v123/folder/name.webp OR folder/name.webp
  const noVersion = afterUpload.replace(/^v\d+\//, "");
  return noVersion.replace(/\.[a-z0-9]+$/i, ""); // remove extension
};