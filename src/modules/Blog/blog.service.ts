import slugify from 'slugify';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import { IBlog } from './blog.interface';

const generateUniqueSlug = async (title: string, currentId?: string): Promise<string> => {
  let baseSlug = slugify(title, { lower: true, strict: true, trim: true });
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

const createBlog = async (payload: IBlog) => {
  const slug = await generateUniqueSlug(payload.title);

  const result = await prisma.blog.create({
    data: {
      userId: payload.userId,
      title: payload.title,
      content: payload.content,
      imageUrl: payload.imageUrl,
      others: payload.others,
      isPublish: payload.isPublish ?? false,
      metaTitle: payload.metaTitle,
      metaDescription: payload.metaDescription,
      keywords: payload.keywords,
      slug,
    },
  });
  return result;
};

const updateBlog = async (id: string, payload: Partial<IBlog>) => {
  const updateData: any = { ...payload };

  if (payload.title) {
    updateData.slug = await generateUniqueSlug(payload.title, id);
  }

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

  const meta = await queryBuilder.getPaginationMeta(prisma.blog);

  return { meta, data: blogs };
};

const getAllBlogsAdmin = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, [
    'title',
    'content',
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

  const meta = await queryBuilder.getPaginationMeta(prisma.blog);

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