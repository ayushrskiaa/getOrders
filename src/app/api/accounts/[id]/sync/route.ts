import { SyncStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { syncOrdersFromAnakin } from "@/lib/anakin";
import { createSyncJob, upsertExtractedOrders } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: params.id } });
  const job = await createSyncJob(account.id);

  try {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: SyncStatus.RUNNING, startedAt: new Date() }
    });

    const result = await syncOrdersFromAnakin(account.platform, account.anakinSessionId);
    const ordersFound = await upsertExtractedOrders(account.userId, result.orders);

    await prisma.$transaction([
      prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: SyncStatus.COMPLETED,
          ordersFound,
          recordingUrl: result.recordingUrl,
          finishedAt: new Date()
        }
      }),
      prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), lastError: null }
      })
    ]);

    return NextResponse.json({ jobId: job.id, status: SyncStatus.COMPLETED, ordersFound });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    const status =
      message.includes("ANAKIN_API_KEY") || message.includes("logged in") || message.includes("session") ? 400 : 500;

    await prisma.$transaction([
      prisma.syncJob.update({
        where: { id: job.id },
        data: { status: SyncStatus.FAILED, error: message, finishedAt: new Date() }
      }),
      prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastError: message }
      })
    ]);

    return NextResponse.json({ jobId: job.id, status: SyncStatus.FAILED, error: message }, { status });
  }
}
