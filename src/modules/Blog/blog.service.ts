import slugify from 'slugify';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import { IBlog } from './blog.interface';


const createBlog = async (payload: IBlog) => {
  const slug = slugify(payload.title, { lower: true, strict: true });
  const existingSlug = await prisma.blog.findUnique({ where: { slug } });
  if (existingSlug) {
    throw new AppError(400, 'Blog title must be unique for slug generation');
  }

  const result = await prisma.blog.create({
    data: {
      userId: payload.userId,
      title: payload.title,
      content: payload.content,
      imageUrl: payload.imageUrl,
      others: payload.others,
      isPublish: payload.isPublish,
      metaTitle: payload.metaTitle,
      metaDescription: payload.metaDescription,
      keywords: payload.keywords,
      slug,
    },
  });
  return result;
};

const updateBlog = async (id: string, payload: IBlog) => {
  let slug = payload.slug;
  if (payload.title && (!slug || slugify(payload.title, { lower: true, strict: true }) !== slug)) {
    slug = slugify(payload.title, { lower: true, strict: true });
    const existingSlug = await prisma.blog.findUnique({ where: { slug } });
    if (existingSlug && existingSlug.id !== id) {
      throw new AppError(400, 'Blog title must be unique for slug generation');
    }
  }

  const result = await prisma.blog.update({
    where: { id },
    data: {
      title: payload.title,
      content: payload.content,
      imageUrl: payload.imageUrl,
      others: payload.others,
      isPublish: payload.isPublish,
      metaTitle: payload.metaTitle,
      metaDescription: payload.metaDescription,
      keywords: payload.keywords,
      slug,
    },
  });
  return result;
};

// Get all blog for normal user
const getAllBlogs = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, [
    'title',
    'content',
  ]);

  // Add isPublish filter to queryParams before building the query
  queryParams.isPublish = true;

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
  });

  const meta = await queryBuilder.getPaginationMeta(prisma.blog);

  return {
    meta,
    data: blogs,
  };
};

// --- Admin --- Get All Blogs with ispublished = false and isdeleted = true
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
  });

  const meta = await queryBuilder.getPaginationMeta(prisma.blog);

  return {
    meta,
    data: blogs,
  };
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
      userId: blog.userId,
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
    },
    take: 8,
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    blog,
    relatedBlogs,
  };
};

const deleteBlog = async (id: string) => {
  const blog = await prisma.blog.findUnique({
    where: {
      id,
    },
  });

  if (!blog) throw new AppError(404, 'Blog not found');

  if (blog.imageUrl) {
    await deleteFile(blog.imageUrl);
  }

  const result = await prisma.blog.delete({
    where: {
      id,
    },
  });
  return result;
};

export const BlogServices = {
  createBlog,
  getAllBlogs,
  getAllBlogsAdmin,
  getBlog,
  updateBlog,
  deleteBlog,
};
