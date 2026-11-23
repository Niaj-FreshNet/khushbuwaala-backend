import { Router } from 'express';
import { DiscoveryController } from './discovery.controller';

const router = Router();

// Public, read-only. Shop listing with search, filters, counts per filter option and sorting.
router.get('/', DiscoveryController.discover);
router.get('/suggest', DiscoveryController.suggest);
router.get('/similar/:slug', DiscoveryController.similar);
router.get('/sitemap', DiscoveryController.sitemap);

export const DiscoveryRoutes = router;
