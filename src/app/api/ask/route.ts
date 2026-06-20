import { NextResponse } from "next/server";
import { z } from "zod";
import { answerOrderQuestion } from "@/lib/ai";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().min(3)
});

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());
  const answer = await answerOrderQuestion(body.question);

  return NextResponse.json({ answer });
}
