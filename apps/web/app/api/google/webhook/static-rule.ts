import { gmail_v1 } from "googleapis";
import {
  excuteRuleActions,
  getFunctionsFromRules,
} from "@/app/api/ai/act/controller";
import { ParsedMessage, RuleWithActions } from "@/utils/types";
import { User } from "@prisma/client";
import {
  getActionItemsFromAiArgsResponse,
  getArgsAiResponse,
} from "@/app/api/ai/act/ai-choose-args";
import { emailToContent } from "@/utils/mail";

export async function handleStaticRule({
  message,
  user,
  gmail,
  rules,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  user: Pick<
    User,
    "id" | "email" | "aiModel" | "aiProvider" | "openAIApiKey" | "about"
  >;
  gmail: gmail_v1.Gmail;
}): Promise<{ handled: boolean }> {
  const staticRule = findStaticRule(rules, message);
  if (!staticRule) {
    return { handled: false };
  }

  const email = {
    from: message.headers.from,
    to: message.headers.to,
    subject: message.headers.subject,
    headerMessageId: message.headers["message-id"] || "",
    messageId: message.id,
    snippet: message.snippet,
    textHtml: message.textHtml || null,
    textPlain: message.textPlain || null,
    threadId: message.threadId,
    cc: message.headers.cc || undefined,
    date: message.headers.date,
    references: message.headers.references,
    replyTo: message.headers["reply-to"],
    content: emailToContent({
      textHtml: message.textHtml || null,
      textPlain: message.textPlain || null,
      snippet: message.snippet || null,
    }),
  };

  const functions = getFunctionsFromRules({ rules: [staticRule] });
  const shouldAiGenerateArgs =
    functions.rulesWithProperties[0].shouldAiGenerateArgs;

  // generate args
  const aiArgsResponse = shouldAiGenerateArgs
    ? await getArgsAiResponse({
        email,
        selectedFunction: functions.functions[0],
        aiModel: user.aiModel,
        aiProvider: user.aiProvider,
        openAIApiKey: user.openAIApiKey,
        userAbout: user.about || "",
        userEmail: user.email || "",
      })
    : undefined;

  const actionItems = getActionItemsFromAiArgsResponse(
    aiArgsResponse,
    staticRule.actions,
  );

  // handle action
  await excuteRuleActions(
    {
      gmail,
      userId: user.id,
      userEmail: user.email || "",
      allowExecute: true,
      email,
    },
    {
      rule: staticRule,
      actionItems,
    },
  );

  return { handled: true };
}

function findStaticRule(
  applicableRules: RuleWithActions[],
  parsedMessage: ParsedMessage,
): RuleWithActions | null {
  for (const rule of applicableRules) {
    const fromMatch = rule.from
      ? new RegExp(rule.from).test(parsedMessage.headers.from)
      : true;
    const toMatch = rule.to
      ? new RegExp(rule.to).test(parsedMessage.headers.to)
      : true;
    const subjectMatch = rule.subject
      ? new RegExp(rule.subject).test(parsedMessage.headers.subject)
      : true;
    const bodyMatch = rule.body
      ? new RegExp(rule.body).test(parsedMessage.textPlain || "")
      : true;

    if (fromMatch && toMatch && subjectMatch && bodyMatch) {
      return rule;
    }
  }
  return null;
}