import type { Request } from "express";
import type { FileFilterCallback } from "multer";

export const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
	const allowedMimeTypes = [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/bmp",
		"image/tiff",
		"image/webp",
		"audio/mpeg",
		"video/mp4",
		"application/pdf",
	];

	if (
		allowedMimeTypes.includes(file.mimetype) ||
		file.mimetype.startsWith("image/")
	) {
		cb(null, true);
	} else {
		cb(new Error("Invalid file type"));
	}
};
