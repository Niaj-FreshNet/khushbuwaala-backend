import { NextFunction, Request, RequestHandler, Response } from 'express';

const catchAsync = (
    fn: RequestHandler<Record<string, string>, any, any, any>
): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(
            fn(req as Request<Record<string, string>, any, any, any>, res, next)
        ).catch((err) => next(err));
    };
};

export default catchAsync;