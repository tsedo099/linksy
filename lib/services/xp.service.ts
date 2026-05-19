import { prisma } from "@/lib/prisma";
import { checkAndIncrDailyCap, incrLeaderboard } from "@/lib/redis";
import { XPAction } from "@/lib/generated/prisma/client";

const XP_AMOUNTS: Record<XPAction, number> = {
  POST_CREATED:     10,
  LIKE_RECEIVED:    2,
  COMMENT_RECEIVED: 3,
  DAILY_LOGIN:      5,
  FOLLOW_RECEIVED:  4,
};

const SUB_MULTIPLIERS: Record<string, number> = {
  FREE: 1.0,
  PRO:  1.4,
};

export function computeLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100));
}

export async function grantXP({
  userId,
  action,
  sourceId,
  actorId,
  postId,
}: {
  userId:   string;
  action:   XPAction;
  sourceId?: string;
  actorId?:  string;
  postId?:   string;
}) {
  if (actorId && actorId === userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creatorMode: true, subscriptionTier: true, creatorXP: true },
  });
  if (!user?.creatorMode) return;

  const allowed = await checkAndIncrDailyCap(userId, action);
  if (!allowed) return;

  const base       = XP_AMOUNTS[action] ?? 1;
  const multiplier = SUB_MULTIPLIERS[user.subscriptionTier] ?? 1.0;
  const amount     = Math.round(base * multiplier);

  const newXP    = user.creatorXP + amount;
  const newLevel = computeLevel(newXP);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data:  { creatorXP: newXP, level: newLevel },
    }),
    prisma.xPLog.create({
      data: { userId, action, amount, sourceId, postId },
    }),
  ]);

  await incrLeaderboard(userId, amount);
}

export async function canEnableCreatorMode(userId: string): Promise<boolean> {
  const [posts, likes, comments] = await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.like.count({ where: { post: { authorId: userId }, NOT: { userId } } }),
    prisma.comment.count({ where: { post: { authorId: userId }, NOT: { authorId: userId } } }),
  ]);
  return posts >= 2 || (likes + comments) >= 10;
}

export async function getCreatorEligibility(userId: string) {
  const [posts, likes, comments, user] = await Promise.all([
    prisma.post.count({ where: { authorId: userId } }),
    prisma.like.count({ where: { post: { authorId: userId }, NOT: { userId } } }),
    prisma.comment.count({ where: { post: { authorId: userId }, NOT: { authorId: userId } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { creatorMode: true } }),
  ]);
  const interactions = likes + comments;
  const postsGoal        = 2;
  const interactionsGoal = 10;
  const eligible = posts >= postsGoal || interactions >= interactionsGoal;
  return { eligible, creatorMode: user?.creatorMode ?? false, posts, interactions, postsGoal, interactionsGoal };
}
