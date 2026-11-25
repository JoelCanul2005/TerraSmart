import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { serializePost } from '../lib/serialize.js';
import { imageUrlSchema } from '../lib/validation.js';
import { asyncHandler, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const postSchema = z.object({
  title: z.string().trim().min(4, 'El título es muy corto').max(120),
  body: z.string().trim().min(10, 'Cuéntanos un poco más').max(2000),
  tag: z.enum(['general', 'dudas', 'consejos', 'plagas', 'fertilizacion', 'riego']).default('general'),
  imageUrl: imageUrlSchema,
});

router.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const { q, tag } = req.query;
    const posts = await prisma.forumPost.findMany({
      where: {
        ...(tag && tag !== 'todos' ? { tag } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: String(q), mode: 'insensitive' } },
                { body: { contains: String(q), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    res.json({ posts: posts.map(serializePost) });
  }),
);

router.post(
  '/posts',
  asyncHandler(async (req, res) => {
    const data = postSchema.parse(req.body);
    const post = await prisma.forumPost.create({
      data: { ...data, imageUrl: data.imageUrl ?? null, userId: req.userId },
      include: { user: { select: { id: true, name: true } }, _count: { select: { comments: true } } },
    });
    res.status(201).json({ post: serializePost(post) });
  }),
);

router.get(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const post = await prisma.forumPost.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
        comments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!post) throw notFound('Publicación no encontrada');
    res.json({ post: serializePost(post), comments: post.comments });
  }),
);

router.post(
  '/posts/:id/comments',
  asyncHandler(async (req, res) => {
    const data = z.object({ body: z.string().trim().min(1, 'Escribe un comentario').max(600) }).parse(req.body);
    const post = await prisma.forumPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw notFound('Publicación no encontrada');

    const comment = await prisma.comment.create({
      data: { body: data.body, postId: post.id, userId: req.userId },
      include: { user: { select: { id: true, name: true } } },
    });
    res.status(201).json({ comment });
  }),
);

router.post(
  '/posts/:id/like',
  asyncHandler(async (req, res) => {
    const post = await prisma.forumPost.findUnique({ where: { id: req.params.id } });
    if (!post) throw notFound('Publicación no encontrada');

    const updated = await prisma.forumPost.update({
      where: { id: post.id },
      data: { likes: { increment: 1 } },
      select: { id: true, likes: true },
    });
    res.json({ post: updated });
  }),
);

router.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const post = await prisma.forumPost.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!post) throw notFound('Publicación no encontrada');
    await prisma.forumPost.delete({ where: { id: post.id } });
    res.status(204).end();
  }),
);

export default router;
