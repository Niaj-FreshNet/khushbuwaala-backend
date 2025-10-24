// import {
//   S3Client,
//   PutObjectCommand,
//   DeleteObjectCommand,
// } from '@aws-sdk/client-s3';
// import multer from 'multer';
// // import { nanoid } from 'nanoid';
// import config from '../config';

// // Memory storage for serverless compatibility
// const storage = multer.memoryStorage();
// export const upload = multer({
//   storage,
// });

// // DigitalOcean S3 client setup
// const s3Client = new S3Client({
//   region: 'us-east-1',
//   endpoint: config.aws.do_space_endpoint,
//   credentials: {
//     accessKeyId: config.aws.do_space_access_key || '',
//     secretAccessKey: config.aws.do_space_secret_key || '',
//   },
// });

// // Upload function
// export const uploadToDigitalOceanAWS = async (
//   file: Express.Multer.File,
// ): Promise<{ location: string }> => {
//   try {
//     const { nanoid } = require('nanoid');

//     const key = `${nanoid()}-${file.originalname}`;

//     const command = new PutObjectCommand({
//       Bucket: config.aws.do_space_bucket,
//       Key: key,
//       Body: file.buffer,
//       ACL: 'public-read',
//       ContentType: file.mimetype,
//     });

//     await s3Client.send(command);

//     const location = `${config.aws.do_space_endpoint}/${config.aws.do_space_bucket}/${key}`;
//     return { location };
//   } catch (error: any) {
//     throw new Error(`Upload failed: ${error.message}`);
//   }
// };

// // Optional delete function
// export const deleteFromDigitalOceanAWS = async (
//   fileUrl: string,
// ): Promise<void> => {
//   try {
//     const key = fileUrl.split(`/${config.aws.do_space_bucket}/`)[1];

//     const command = new DeleteObjectCommand({
//       Bucket: config.aws.do_space_bucket,
//       Key: key,
//     });

//     await s3Client.send(command);
//   } catch (error: any) {
//     throw new Error(`Delete failed: ${error.message}`);
//   }
// };


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
