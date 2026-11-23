import type { Role } from '@prisma/client';

/** The signed-in user that middlewares/auth.ts puts on the request (null for a visitor on OPTIONAL routes). */
export type AuthUser = {
    id: string;
    name: string;
    email: string;
    role: Role;
    imageUrl: string | null;
    isVerified: boolean;
};

declare module "express-serve-static-core" {
    interface ParamsDictionary {
        [key: string]: string;
    }
    interface Request {
        user?: AuthUser | null;
        /** exact request bytes, kept for webhook signature checks (app.ts) */
        rawBody?: Buffer;
    }
}
