import { Response } from 'express';

type TResponse<T> = {
    statusCode: number;
    success: boolean;
    message?: string;
    meta?: {
        total?: number;
        page?: number;
        limit?: number;
        [key: string]: any;
    };
    filters?: Record<string, any>;
    data?: T;
};

const sendResponse = <T>(res: Response, data: TResponse<T>) => {
    res.status(data.statusCode).json({
        success: data.success,
        statusCode: data.statusCode,
        message: data.message,
        meta: data.meta,
        filters: data.filters,
        data: data.data,
    });
};
export default sendResponse;