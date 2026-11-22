import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import config from '../config';

import AppError from '../errors/AppError';
import { TErrorSource } from '../interface/error';
import handleZodError from '../errors/handleZodError';
import handleValidationError from '../errors/handleValidationError';
import handleCastError from '../errors/handleCastError';
import handleDuplicateError from '../errors/handleDuplicateError';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Prisma validation / engine errors (wrong argument types, connection problems, ...)
const isPrismaInternal = (err: any) =>
  !!err && typeof err.name === 'string' && /^PrismaClient(Validation|Unknown|Rust|Initialization)/.test(err.name);

const globalErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // setting default values
  let statusCode = 500;
  let message = 'Something went wrong';

  let errorSources: TErrorSource = [
    {
      path: '',
      message: 'Something Went Wrong',
    },
  ];

  // Handle Zod Errors
  if (err instanceof ZodError) {
    const simplifiedError = handleZodError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;

    // Handle Mongoose Validation Errors
  } else if (err?.name === 'ValidationError') {
    const simplifiedError = handleValidationError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;

    // Handle Mongoose Cast Errors
  } else if (err?.name === 'CastError') {
    const simplifiedError = handleCastError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;

    // Handle MongoDB Duplicate Errors (11000)
  } else if (err?.code === 11000) {
    const simplifiedError = handleDuplicateError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;

    // Handle Prisma Duplicate Errors (P2002)
  } else if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
    const simplifiedError = handleDuplicateError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;

    // Prisma "record not found" (update/delete of a missing id) -> 404
  } else if (err instanceof PrismaClientKnownRequestError && err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
    errorSources = [{ path: '', message }];

    // Other Prisma errors: the raw text names models, fields and query parts, so it is
    // logged on the server and the caller gets a plain message.
  } else if (err instanceof PrismaClientKnownRequestError || isPrismaInternal(err)) {
    message = 'Database error. Please try again.';
    errorSources = [{ path: '', message }];

    // Body that isn't valid JSON (express.json) -> 400, not 500
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body is not valid JSON';
    errorSources = [{ path: '', message }];

    // Upload too large (multer) -> 400 with its message
  } else if (err?.name === 'MulterError') {
    statusCode = 400;
    message = err.message;
    errorSources = [{ path: err.field || '', message }];

    // Handle Custom AppErrors
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [
      {
        path: '',
        message: err.message,
      },
    ];

    // Handle Generic JavaScript Errors
  } else if (err instanceof Error) {
    message = err.message;
    errorSources = [
      {
        path: '',
        message: err.message,
      },
    ];
  }

  // Server-side faults leave a trace in the pm2 log (they were silent before).
  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${statusCode}:`, err?.stack || err);
  }

  // Respond with error details
  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    stack: config.node_env === 'development' ? err.stack : null,
  });
};

export default globalErrorHandler;
