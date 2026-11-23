import { Request, Response, NextFunction } from "express";

export function parseJsonFields(req: Request, res: Response, next: NextFunction) {
    const body = req.body || {};

    // List of fields that can be JSON
    const jsonFields = [
        "variants",
        "tags",
        "perfumeNotes",
        "accords",
        "bestFor",
        "imagesToKeep",   // ✅ ADD THIS
        "materialIds",    // ✅ recommended (FormData sends as string)
        "fragranceIds",   // ✅ recommended
    ];

    for (const field of jsonFields) {
        if (body[field] !== undefined) {
            if (typeof body[field] === "string") {
                try {
                    body[field] = JSON.parse(body[field]);
                } catch {
                    return res.status(400).json({ message: `${field} must be valid JSON` });
                }
            }
        }
    }

    // Convert 'published' string to boolean
    if (body.published !== undefined && typeof body.published === "string") {
        body.published = body.published.toLowerCase() === "true";
    }

    // 🔥 Convert numeric fields (only top-level numeric fields)
    const numberFields = ["stock"];
    for (const field of numberFields) {
        if (body[field] !== undefined && body[field] !== null) {
            const num = Number(body[field]);
            if (!isNaN(num)) body[field] = num;
        }
    }

    next();
}