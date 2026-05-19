import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const USERS = [
  { username: "munkh_zul", displayName: "Munkhzul G.", email: "munkh@linksy.mn", bio: "Photographer and visual storyteller" },
  { username: "bat_bold", displayName: "Batbold D.", email: "bat@linksy.mn", bio: "Travel lover exploring Mongolia" },
  { username: "saran_od", displayName: "Saranoo B.", email: "saran@linksy.mn", bio: "Coffee and code" },
  { username: "nomin_e", displayName: "Nomin E.", email: "nomin@linksy.mn", bio: "Design and art" },
  { username: "dorj_b", displayName: "Dorj B.", email: "dorj@linksy.mn", bio: "Software engineer" },
];

const CONVOS = [
  {
    a: "munkh_zul", b: "bat_bold",
    messages: [
      { from: "munkh_zul", text: "Hey! I saw your Khangai photos and they look amazing." },
      { from: "bat_bold", text: "Thank you! I shot them yesterday and the light was perfect." },
      { from: "munkh_zul", text: "What camera did you use?" },
      { from: "bat_bold", text: "Sony A7IV with a 24-70mm. My usual combo." },
      { from: "munkh_zul", text: "Looking forward to the next trip set." },
    ],
  },
  {
    a: "munkh_zul", b: "saran_od",
    messages: [
      { from: "saran_od", text: "Hi! Want to grab coffee tomorrow?" },
      { from: "munkh_zul", text: "Sure, what time works for you?" },
      { from: "saran_od", text: "Would 10 in the morning be good?" },
      { from: "munkh_zul", text: "Perfect. Let us meet at Central Coffee." },
      { from: "saran_od", text: "Sounds good, see you there." },
    ],
  },
  {
    a: "munkh_zul", b: "nomin_e",
    messages: [
      { from: "nomin_e", text: "Your latest post looks so good." },
      { from: "munkh_zul", text: "Thanks! I always keep up with your design work too." },
      { from: "nomin_e", text: "Want to collaborate? I have a project in mind." },
      { from: "munkh_zul", text: "Absolutely. Tell me more." },
    ],
  },
  {
    a: "bat_bold", b: "dorj_b",
    messages: [
      { from: "dorj_b", text: "The PR is open. Can you take a quick look?" },
      { from: "bat_bold", text: "Yep, I will review it now." },
      { from: "dorj_b", text: "Thanks." },
      { from: "bat_bold", text: "Merged. Nice work on this one." },
    ],
  },
];

async function main() {
  console.log("Starting seed...");

  const hash = await bcrypt.hash("password123", 12);

  /* upsert users */
  const created: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash: hash },
    });
    created[u.username] = user.id;
    console.log(`  - User: @${u.username}`);
  }

  /* follow everyone from munkh_zul */
  const munkhZulId = created["munkh_zul"];
  if (munkhZulId) {
    for (const u of USERS.filter(u => u.username !== "munkh_zul")) {
      const followingId = created[u.username];
      if (!followingId) continue;
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: munkhZulId, followingId } },
        update: {}, create: { followerId: munkhZulId, followingId },
      });
    }
  }

  /* seed posts */
  const captions = [
    "A little spring mood for today. #spring",
    "Khangai range. Nature really hits different. #travel #mongolia",
    "Morning coffee ritual every single day.",
    "Starting a new project today. #coding #design",
    "Weekend vibes in the city. #ulaanbaatar",
  ];
  for (let i = 0; i < USERS.length; i++) {
    const user = USERS[i];
    if (!user) continue;
    const authorId = created[user.username];
    if (!authorId) continue;
    await prisma.post.create({
      data: {
        authorId,
        mediaUrls: [`/uploads/placeholder-${i + 1}.jpg`],
        caption: captions[i] ?? "",
        location: i % 2 === 0 ? "Ulaanbaatar" : "Khangai",
      },
    });
    console.log(`  - Post: ${user.username}`);
  }

  /* seed conversations and messages */
  for (const c of CONVOS) {
    const aId = created[c.a];
    const bId = created[c.b];
    if (!aId || !bId) continue;

    /* find or create conversation */
    let convo = await prisma.conversation.findFirst({
      where: { AND: [{ members: { some: { userId: aId } } }, { members: { some: { userId: bId } } }] },
    });
    if (!convo) {
      convo = await prisma.conversation.create({
        data: { members: { create: [{ userId: aId }, { userId: bId }] } },
      });
    }

    /* add messages */
    for (const m of c.messages) {
      const senderId = created[m.from];
      if (!senderId) continue;
      await prisma.message.create({
        data: {
          conversationId: convo.id,
          senderId,
          text: m.text,
          read: true,
          readAt: new Date(),
        },
      });
    }

    /* mark last message unread */
    const last = await prisma.message.findFirst({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "desc" },
    });
    if (last) {
      await prisma.message.update({ where: { id: last.id }, data: { read: false, readAt: null } });
      await prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
    }

    console.log(`  - Conversation: @${c.a} <-> @${c.b} (${c.messages.length} messages)`);
  }

  console.log("\nSeed completed successfully.");
  console.log("\nLogin credentials:");
  for (const u of USERS) {
    console.log(`   @${u.username.padEnd(12)} -> password123`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
