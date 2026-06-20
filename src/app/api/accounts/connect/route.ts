import { Platform } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectAnakinAccount } from "@/lib/anakin";
import { prisma } from "@/lib/prisma";
import { ensureAppUser } from "@/lib/orders";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  platform: z.nativeEnum(Platform)
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const user = await ensureAppUser();
    const connection = await connectAnakinAccount(body.platform);

    const account = await prisma.connectedAccount.upsert({
      where: { userId_platform: { userId: user.id, platform: body.platform } },
      create: {
        userId: user.id,
        platform: body.platform,
        anakinSessionId: connection.sessionId,
        status: connection.status,
        displayName: connection.displayName,
        lastError: connection.status === "NEEDS_LOGIN" ? connection.message : null
      },
      update: {
        anakinSessionId: connection.sessionId,
        status: connection.status,
        displayName: connection.displayName,
        lastError: connection.status === "NEEDS_LOGIN" ? connection.message : null
      }
    });

    return NextResponse.json({ account, message: connection.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connect error";
    const status = message.includes("ANAKIN_API_KEY") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
