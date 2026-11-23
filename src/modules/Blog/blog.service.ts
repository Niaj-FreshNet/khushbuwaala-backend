import slugify from 'slugify';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import { IBlog } from './blog.interface';
import { Prisma } from '@prisma/client';

const generateUniqueSlug = async (title: string, currentId?: string): Promise<string> => {
  const baseSlug = slugify(title, { lower: true, strict: true, trim: true });
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.blog.findUnique({ where: { slug } });
    if (!existing || (currentId && existing.id === currentId)) {
      return slug;
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

const createBlog = async (payload: IBlog & { faqs?: string; tags?: string; imageAltText?: string }) => {
  const slug = await generateUniqueSlug(payload.title);

  // Combine keywords and tags if tags are provided
  let keywords = payload.keywords || '';
  if (payload.tags) {
    keywords = keywords ? `${keywords}, ${payload.tags}` : payload.tags;
  }

  // Store FAQs and extra metadata inside 'others' field as a JSON string if provided
  let othersData = payload.others || null;
  if (payload.faqs) {
    try {
      // Ensure it's valid JSON before saving
      const parsedFaqs = typeof payload.faqs === 'string' ? JSON.parse(payload.faqs) : payload.faqs;
      othersData = JSON.stringify({ faqs: parsedFaqs });
    } catch {
      othersData = null;
    }
  }

  const result = await prisma.blog.create({
    data: {
      userId: payload.userId,
      title: payload.title,
      content: payload.content,
      imageUrl: payload.imageUrl,
      imageAltText: payload.imageAltText,
      others: othersData,
      isPublish: payload.isPublish ?? false,
      metaTitle: payload.metaTitle,
      metaDescription: payload.metaDescription,
      keywords,
      slug,
    },
  });
  return result;
};

const updateBlog = async (id: string, payload: Partial<IBlog> & { faqs?: string; tags?: string; imageAltText?: string }) => {
  // the request fields plus what is worked out below (tags and faqs are folded in, then removed)
  const updateData: Prisma.BlogUpdateInput & { tags?: string; faqs?: string } = { ...payload };

  if (payload.title) {
    updateData.slug = await generateUniqueSlug(payload.title, id);
  }

  if (payload.tags || payload.keywords) {
    let keywords = payload.keywords || '';
    if (payload.tags) {
      keywords = keywords ? `${keywords}, ${payload.tags}` : payload.tags;
    }
    updateData.keywords = keywords;
  }

  if (payload.faqs) {
    try {
      const parsedFaqs = typeof payload.faqs === 'string' ? JSON.parse(payload.faqs) : payload.faqs;
      updateData.others = JSON.stringify({ faqs: parsedFaqs });
    } catch {
      // Keep existing others if parsing fails
      delete updateData.faqs;
    }
  }

  // Clean up unused temporary payload fields not in Prisma schema
  delete updateData.tags;
  delete updateData.faqs;

  const result = await prisma.blog.update({
    where: { id },
    data: updateData,
  });
  return result;
};

const getAllBlogs = async (queryParams: Record<string, unknown>) => {
  const filterParams = { ...queryParams, isPublish: true };

  const queryBuilder = new PrismaQueryBuilder(filterParams, [
    'title',
    'content',
    'keywords',
  ]);

  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect()
    .getQuery();

  const blogs = await prisma.blog.findMany({
    ...prismaQuery,
    where: {
      ...prismaQuery.where,
      isPublish: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const meta = await queryBuilder.getPaginationMeta((where) => prisma.blog.count({ where }));

  return { meta, data: blogs };
};

const getAllBlogsAdmin = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, [
    'title',
    'content',
    'keywords',
  ]);

  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect()
    .getQuery();

  const blogs = await prisma.blog.findMany({
    ...prismaQuery,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const meta = await queryBuilder.getPaginationMeta((where) => prisma.blog.count({ where }));

  return { meta, data: blogs };
};

const getBlog = async (slug: string) => {
  const blog = await prisma.blog.findUnique({
    where: { slug, isPublish: true },
    include: {
      user: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });

  if (!blog) return null;

  const relatedBlogs = await prisma.blog.findMany({
    where: {
      NOT: { slug },
      isPublish: true,
    },
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      imageAltText: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      keywords: true,
      createdAt: true,
    },
    take: 4,
    orderBy: { createdAt: 'desc' },
  });

  return { blog, relatedBlogs };
};

const deleteBlog = async (id: string) => {
  const blog = await prisma.blog.findUnique({ where: { id } });

  if (!blog) throw new AppError(404, 'Blog not found');

  if (blog.imageUrl) {
    await deleteFile(blog.imageUrl);
  }

  return await prisma.blog.delete({ where: { id } });
};

export const BlogServices = {
  createBlog,
  getAllBlogs,
  getAllBlogsAdmin,
  getBlog,
  updateBlog,
  deleteBlog,
};