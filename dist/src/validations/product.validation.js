"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductValidation = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const product_constant_1 = require("../modules/Product/product.constant");
// Perfume Notes Schema
const perfumeNotesSchema = zod_1.z.object({
    top: zod_1.z.array(zod_1.z.string().min(1)).max(10).optional(),
    middle: zod_1.z.array(zod_1.z.string().min(1)).max(10).optional(),
    base: zod_1.z.array(zod_1.z.string().min(1)).max(10).optional(),
}).optional();
// Product Variant Schema
const productVariantSchema = zod_1.z.object({
    sku: zod_1.z.string().min(1, 'SKU is required').max(50),
    unit: zod_1.z.nativeEnum(client_1.Unit, {
        errorMap: () => ({ message: 'Unit must be ML, GM, or PIECE' })
    }),
    size: zod_1.z.number()
        .min(product_constant_1.PRODUCT_VALIDATION.MIN_SIZE, `Size must be at least ${product_constant_1.PRODUCT_VALIDATION.MIN_SIZE}`)
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_SIZE, `Size cannot exceed ${product_constant_1.PRODUCT_VALIDATION.MAX_SIZE}`),
    price: zod_1.z.number()
        .min(product_constant_1.PRODUCT_VALIDATION.MIN_PRICE, `Price must be at least ${product_constant_1.PRODUCT_VALIDATION.MIN_PRICE}`)
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_PRICE, `Price cannot exceed ${product_constant_1.PRODUCT_VALIDATION.MAX_PRICE}`),
    // stock: z.number()
    //   .min(PRODUCT_VALIDATION.MIN_STOCK, `Stock cannot be negative`)
    //   .max(PRODUCT_VALIDATION.MAX_STOCK, `Stock cannot exceed ${PRODUCT_VALIDATION.MAX_STOCK}`),
});
// Create Product Schema
const createProductZodSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(product_constant_1.PRODUCT_VALIDATION.NAME_MIN_LENGTH, `Name must be at least ${product_constant_1.PRODUCT_VALIDATION.NAME_MIN_LENGTH} characters`)
        .max(product_constant_1.PRODUCT_VALIDATION.NAME_MAX_LENGTH, `Name cannot exceed ${product_constant_1.PRODUCT_VALIDATION.NAME_MAX_LENGTH} characters`),
    description: zod_1.z.string()
        .min(product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH, `Description must be at least ${product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH} characters`)
        .max(product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MAX_LENGTH, `Description cannot exceed ${product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MAX_LENGTH} characters`),
    videoUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    tags: zod_1.z.array(zod_1.z.string().min(1))
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_TAGS, `Cannot have more than ${product_constant_1.PRODUCT_VALIDATION.MAX_TAGS} tags`)
        .optional()
        .default([]),
    // Perfume specifications
    origin: zod_1.z.string().min(1).max(100).optional(),
    brand: zod_1.z.string().min(1).max(100).optional(),
    gender: zod_1.z.enum(product_constant_1.PERFUME_GENDERS).optional(),
    perfumeNotes: perfumeNotesSchema,
    accords: zod_1.z.array(zod_1.z.string().min(1))
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_ACCORDS, `Cannot have more than ${product_constant_1.PRODUCT_VALIDATION.MAX_ACCORDS} accords`)
        .optional()
        .default([]),
    performance: zod_1.z.enum(product_constant_1.PERFORMANCE_LEVELS).optional(),
    longevity: zod_1.z.enum(product_constant_1.LONGEVITY_LEVELS).optional(),
    projection: zod_1.z.enum(product_constant_1.PROJECTION_LEVELS).optional(),
    sillage: zod_1.z.enum(product_constant_1.SILLAGE_LEVELS).optional(),
    bestFor: zod_1.z.array(zod_1.z.string().min(1))
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_BEST_FOR, `Cannot have more than ${product_constant_1.PRODUCT_VALIDATION.MAX_BEST_FOR} occasions`)
        .optional()
        .default([]),
    categoryId: zod_1.z.string().min(1, 'Category ID is required'),
    published: zod_1.z.boolean().optional().default(false),
    stock: zod_1.z.number()
        .min(product_constant_1.PRODUCT_VALIDATION.MIN_STOCK, `Stock cannot be negative`)
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_STOCK, `Stock cannot exceed ${product_constant_1.PRODUCT_VALIDATION.MAX_STOCK}`),
    variants: zod_1.z.array(productVariantSchema)
        .min(1, 'At least one variant is required')
        .max(20, 'Cannot have more than 20 variants'),
});
// Update Product Schema
const updateProductZodSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(product_constant_1.PRODUCT_VALIDATION.NAME_MIN_LENGTH, `Name must be at least ${product_constant_1.PRODUCT_VALIDATION.NAME_MIN_LENGTH} characters`)
        .max(product_constant_1.PRODUCT_VALIDATION.NAME_MAX_LENGTH, `Name cannot exceed ${product_constant_1.PRODUCT_VALIDATION.NAME_MAX_LENGTH} characters`)
        .optional(),
    description: zod_1.z.string()
        .min(product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH, `Description must be at least ${product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH} characters`)
        .max(product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MAX_LENGTH, `Description cannot exceed ${product_constant_1.PRODUCT_VALIDATION.DESCRIPTION_MAX_LENGTH} characters`)
        .optional(),
    videoUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    tags: zod_1.z.array(zod_1.z.string().min(1))
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_TAGS, `Cannot have more than ${product_constant_1.PRODUCT_VALIDATION.MAX_TAGS} tags`)
        .optional(),
    // Perfume specifications
    origin: zod_1.z.string().min(1).max(100).optional(),
    brand: zod_1.z.string().min(1).max(100).optional(),
    gender: zod_1.z.enum(product_constant_1.PERFUME_GENDERS).optional(),
    perfumeNotes: perfumeNotesSchema,
    accords: zod_1.z.array(zod_1.z.string().min(1))
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_ACCORDS, `Cannot have more than ${product_constant_1.PRODUCT_VALIDATION.MAX_ACCORDS} accords`)
        .optional(),
    performance: zod_1.z.enum(product_constant_1.PERFORMANCE_LEVELS).optional(),
    longevity: zod_1.z.enum(product_constant_1.LONGEVITY_LEVELS).optional(),
    projection: zod_1.z.enum(product_constant_1.PROJECTION_LEVELS).optional(),
    sillage: zod_1.z.enum(product_constant_1.SILLAGE_LEVELS).optional(),
    bestFor: zod_1.z.array(zod_1.z.string().min(1))
        .max(product_constant_1.PRODUCT_VALIDATION.MAX_BEST_FOR, `Cannot have more than ${product_constant_1.PRODUCT_VALIDATION.MAX_BEST_FOR} occasions`)
        .optional(),
    categoryId: zod_1.z.string().min(1).optional(),
    // published: z.boolean().optional(),
    published: zod_1.z
        .preprocess((val) => {
        if (val === 'true')
            return true;
        if (val === 'false')
            return false;
        return val;
    }, zod_1.z.boolean())
        .optional(),
    imagesToKeep: zod_1.z.array(zod_1.z.string().url()).optional(),
    variants: zod_1.z.array(productVariantSchema)
        .min(1, 'At least one variant is required')
        .max(20, 'Cannot have more than 20 variants')
        .optional(),
});
// Query Validation Schema
const productQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    brand: zod_1.z.string().optional(),
    gender: zod_1.z.enum(product_constant_1.PERFUME_GENDERS).optional(),
    origin: zod_1.z.string().optional(),
    minPrice: zod_1.z.coerce.number().min(0).optional(),
    maxPrice: zod_1.z.coerce.number().min(0).optional(),
    tags: zod_1.z.string().optional(), // comma-separated
    accords: zod_1.z.string().optional(), // comma-separated
    bestFor: zod_1.z.string().optional(), // comma-separated
    performance: zod_1.z.enum(product_constant_1.PERFORMANCE_LEVELS).optional(),
    longevity: zod_1.z.enum(product_constant_1.LONGEVITY_LEVELS).optional(),
    projection: zod_1.z.enum(product_constant_1.PROJECTION_LEVELS).optional(),
    sillage: zod_1.z.enum(product_constant_1.SILLAGE_LEVELS).optional(),
    stock: zod_1.z.enum(['in', 'out']).optional(),
    sortBy: zod_1.z.enum([
        'name',
        'name_desc',
        'price_asc',
        'price_desc',
        'newest',
        'oldest',
        'popularity'
    ]).optional(),
    page: zod_1.z.coerce.number().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().min(1).max(100).optional().default(12),
});
// Stock Update Schema
const stockUpdateSchema = zod_1.z.object({
    body: zod_1.z.object({
        newStock: zod_1.z.number()
            .min(product_constant_1.PRODUCT_VALIDATION.MIN_STOCK, 'Stock cannot be negative')
            .max(product_constant_1.PRODUCT_VALIDATION.MAX_STOCK, `Stock cannot exceed ${product_constant_1.PRODUCT_VALIDATION.MAX_STOCK}`),
        reason: zod_1.z.string().max(200).optional(),
    })
});
// ID Parameter Schema
const mongoIdSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId'),
    })
});
exports.ProductValidation = {
    createProductZodSchema,
    updateProductZodSchema,
    productQuerySchema,
    stockUpdateSchema,
    mongoIdSchema,
    productVariantSchema,
    perfumeNotesSchema
};
