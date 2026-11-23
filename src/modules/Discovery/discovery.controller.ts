import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AppError from '../../errors/AppError';
import { parseDiscoveryQuery } from './engine';
import { DiscoveryServices } from './discovery.service';

// Listings are the same for every visitor: let the browser and Next.js reuse them briefly.
const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=120';

const discover = catchAsync(async (req, res) => {
  const result = await DiscoveryServices.discover(parseDiscoveryQuery(req.query as Record<string, unknown>));
  res.set('Cache-Control', PUBLIC_CACHE);
  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Products retrieved successfully',
    meta: result.meta,
    facets: result.facets,
    data: result.data,
  });
});

const suggest = catchAsync(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const result = await DiscoveryServices.suggest(q);
  res.set('Cache-Control', PUBLIC_CACHE);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Suggestions', data: result });
});

const similar = catchAsync(async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 8));
  const result = await DiscoveryServices.similar(req.params.slug, limit);
  if (!result) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
  res.set('Cache-Control', PUBLIC_CACHE);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Similar products', data: result });
});

const sitemap = catchAsync(async (_req, res) => {
  const result = await DiscoveryServices.sitemap();
  res.set('Cache-Control', 'public, max-age=300');
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Sitemap', data: result });
});

export const DiscoveryController = { discover, suggest, similar, sitemap };
