import { NextFunction, Request, RequestHandler, Response } from 'express';

// Passes a rejected promise (thrown AppError, Prisma error…) on to the global error handler.
const catchAsync = (fn: RequestHandler): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch((err) => next(err));
    };
};

export default catchAsync;