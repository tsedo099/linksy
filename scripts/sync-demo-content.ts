import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const USERS = {
  munkh_zul: {
    displayName: "Munkhzul G.",
    bio: "Photographer and visual storyteller",
  },
  bat_bold: {
    displayName: "Batbold D.",
    bio: "Travel lover exploring Mongolia",
  },
  saran_od: {
    displayName: "Saranoo B.",
    bio: "Coffee and code",
  },
  nomin_e: {
    displayName: "Nomin E.",
    bio: "Design and art",
  },
  dorj_b: {
    displayName: "Dorj B.",
    bio: "Software engineer",
  },
} as const;

const POSTS = [
  {
    username: "munkh_zul",
    mediaUrl: "/uploads/placeholder-1.jpg",
    caption: "A little spring mood for today. #spring",
    location: "Ulaanbaatar",
  },
  {
    username: "bat_bold",
    mediaUrl: "/uploads/placeholder-2.jpg",
    caption: "Khangai range. Nature really hits different. #travel #mongolia",
    location: "Khangai",
  },
  {
    username: "saran_od",
    mediaUrl: "/uploads/placeholder-3.jpg",
    caption: "Morning coffee ritual every single day.",
    location: "Ulaanbaatar",
  },
  {
    username: "nomin_e",
    mediaUrl: "/uploads/placeholder-4.jpg",
    caption: "Starting a new project today. #coding #design",
    location: "Khangai",
  },
  {
    username: "dorj_b",
    mediaUrl: "/uploads/placeholder-5.jpg",
    caption: "Weekend vibes in the city. #ulaanbaatar",
    location: "Ulaanbaatar",
  },
] as const;

const CONVERSATIONS = [
  {
    members: ["munkh_zul", "bat_bold"] as const,
    messages: [
      { from: "munkh_zul", text: "Hey! I saw your Khangai photos and they look amazing." },
      { from: "bat_bold", text: "Thank you! I shot them yesterday and the light was perfect." },
      { from: "munkh_zul", text: "What camera did you use?" },
      { from: "bat_bold", text: "Sony A7IV with a 24-70mm. My usual combo." },
      { from: "munkh_zul", text: "Looking forward to the next trip set." },
    ],
  },
  {
    members: ["munkh_zul", "saran_od"] as const,
    messages: [
      { from: "saran_od", text: "Hi! Want to grab coffee tomorrow?" },
      { from: "munkh_zul", text: "Sure, what time works for you?" },
      { from: "saran_od", text: "Would 10 in the morning be good?" },
      { from: "munkh_zul", text: "Perfect. Let us meet at Central Coffee." },
      { from: "saran_od", text: "Sounds good, see you there." },
    ],
  },
  {
    members: ["munkh_zul", "nomin_e"] as const,
    messages: [
      { from: "nomin_e", text: "Your latest post looks so good." },
      { from: "munkh_zul", text: "Thanks! I always keep up with your design work too." },
      { from: "nomin_e", text: "Want to collaborate? I have a project in mind." },
      { from: "munkh_zul", text: "Absolutely. Tell me more." },
    ],
  },
  {
    members: ["bat_bold", "dorj_b"] as const,
    messages: [
      { from: "dorj_b", text: "The PR is open. Can you take a quick look?" },
      { from: "bat_bold", text: "Yep, I will review it now." },
      { from: "dorj_b", text: "Thanks." },
      { from: "bat_bold", text: "Merged. Nice work on this one." },
    ],
  },
] as const;

async function syncUsers() {
  for (const [username, details] of Object.entries(USERS)) {
    const result = await prisma.user.updateMany({
      where: { username },
      data: details,
    });

    console.log(`users:${username}=${result.count}`);
  }
}

async function syncPosts(userIds: Record<string, string>) {
  for (const post of POSTS) {
    const authorId = userIds[post.username];
    if (!authorId) {
      console.log(`posts:${post.username}=missing-user`);
      continue;
    }

    const result = await prisma.post.updateMany({
      where: {
        authorId,
        mediaUrls: { has: post.mediaUrl },
      },
      data: {
        caption: post.caption,
        location: post.location,
      },
    });

    console.log(`posts:${post.username}=${result.count}`);
  }
}

async function syncConversations(userIds: Record<string, string>) {
  for (const convo of CONVERSATIONS) {
    const [firstUsername, secondUsername] = convo.members;
    const firstId = userIds[firstUsername];
    const secondId = userIds[secondUsername];

    if (!firstId || !secondId) {
      console.log(`convo:${firstUsername}-${secondUsername}=missing-user`);
      continue;
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: firstId } } },
          { members: { some: { userId: secondId } } },
        ],
      },
      include: {
        members: true,
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation || conversation.members.length !== 2) {
      console.log(`convo:${firstUsername}-${secondUsername}=missing`);
      continue;
    }

    let updates = 0;
    for (let index = 0; index < convo.messages.length; index += 1) {
      const message = conversation.messages[index];
      const fixture = convo.messages[index];

      if (!message || !fixture) {
        continue;
      }

      const expectedSenderId = userIds[fixture.from];
      if (message.senderId !== expectedSenderId) {
        console.log(`convo:${firstUsername}-${secondUsername}=sender-mismatch-at-${index + 1}`);
        continue;
      }

      await prisma.message.update({
        where: { id: message.id },
        data: { text: fixture.text },
      });
      updates += 1;
    }

    console.log(`convo:${firstUsername}-${secondUsername}=${updates}`);
  }
}

async function main() {
  const usernames = Object.keys(USERS);
  const rows = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  });

  const userIds = Object.fromEntries(rows.map((row) => [row.username, row.id]));

  await syncUsers();
  await syncPosts(userIds);
  await syncConversations(userIds);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
