import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

type AuditInput = {
  action: string;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  request?: NextRequest;
};

function requestMeta(request?: NextRequest) {
  if (!request) {
    return { ipAddress: null as string | null, userAgent: null as string | null };
  }
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded
    ? forwarded.split(",")[0]?.trim() || null
    : request.headers.get("x-real-ip") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  return { ipAddress, userAgent };
}

export async function writeAuditLog(input: AuditInput) {
  const { ipAddress, userAgent } = requestMeta(input.request);
  await prisma.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ipAddress,
      userAgent,
      metadata: input.metadata ?? undefined,
    },
  });
}
