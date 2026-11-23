import { Router } from 'express';
import { DiscoveryController } from './discovery.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Public, read-only. Shop listing with search, filters, counts per filter option and sorting.
router.get('/', DiscoveryController.discover);
router.get('/suggest', DiscoveryController.suggest);
router.get('/similar/:slug', DiscoveryController.similar);
router.get('/sitemap', DiscoveryController.sitemap);

// Staff only: which products have missing or unrecognised fragrance data
router.get('/data-check', auth('ADMIN', 'SUPER_ADMIN'), DiscoveryController.dataCheck);

export const DiscoveryRoutes = router;
