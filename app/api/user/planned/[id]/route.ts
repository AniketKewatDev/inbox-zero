import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import {
  executePlan,
  executePlanBody,
} from "@/app/api/user/planned/[id]/controller";
import { getGmailClient } from "@/utils/gmail/client";

export const POST = withError(async (request, { params }) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });
  if (!params.id) return NextResponse.json({ error: "Missing id" });

  const json = await request.json();
  const body = executePlanBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await executePlan(
    { ...body, planId: params.id, userId: session.user.id },
    gmail
  );

  return NextResponse.json(result);
});
