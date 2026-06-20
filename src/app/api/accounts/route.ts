import { NextResponse } from "next/server";
import { ensureAppUser } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureAppUser();
  const accounts = await prisma.connectedAccount.findMany({
    where: { userId: user.id },
    orderBy: { platform: "asc" }
  });

  return NextResponse.json({ accounts });
}
