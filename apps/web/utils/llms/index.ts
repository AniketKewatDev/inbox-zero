import type { z } from "zod";
import {
  APICallError,
  type CoreTool,
  generateObject,
  generateText,
  streamText,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import { Model, Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { addUserErrorMessage, ErrorType } from "@/utils/error-messages";
import {
  isAnthropicInsufficientBalanceError,
  isGroqInvalidApiKeyError,
  isGroqQuotaExceededError,
  isGroqRateLimitError,
  isIncorrectOpenAIAPIKeyError,
  isInvalidOpenAIModelError,
  isOpenAIAPIKeyDeactivatedError,
  isOpenAIRetryError,
} from "@/utils/error";

function getModel({ aiProvider, aiModel, aiApiKey }: UserAIFields) {
  const provider = aiProvider || Provider.ANTHROPIC;

  if (provider === Provider.OPEN_AI) {
    const model = aiModel || Model.GPT_4O;
    return {
      provider: Provider.OPEN_AI,
      model,
      llmModel: createOpenAI({ apiKey: aiApiKey || env.OPENAI_API_KEY })(model),
    };
  }

  if (provider === Provider.ANTHROPIC) {
    if (aiApiKey) {
      const model = aiModel || Model.CLAUDE_3_5_SONNET_ANTHROPIC;
      return {
        provider: Provider.ANTHROPIC,
        model,
        llmModel: createAnthropic({ apiKey: aiApiKey })(model),
      };
    }
    if (!env.BEDROCK_ACCESS_KEY)
      throw new Error("BEDROCK_ACCESS_KEY is not set");
    if (!env.BEDROCK_SECRET_KEY)
      throw new Error("BEDROCK_SECRET_KEY is not set");

    const model = aiModel || Model.CLAUDE_3_5_SONNET_BEDROCK;

    return {
      provider: Provider.ANTHROPIC,
      model,
      llmModel: createAmazonBedrock({
        bedrockOptions: {
          region: env.BEDROCK_REGION,
          credentials: {
            accessKeyId: env.BEDROCK_ACCESS_KEY,
            secretAccessKey: env.BEDROCK_SECRET_KEY,
          },
        },
      })(model),
    };
  }

  if (provider === Provider.GROQ) {
    if (!aiApiKey && !env.GROQ_API_KEY) {
      throw new Error("GROQ API key is not set");
    }
    const model = aiModel || Model.LLAMA_3_70B_GROQ;
    return {
      provider: Provider.GROQ,
      model,
      llmModel: createGroq({ apiKey: aiApiKey || env.GROQ_API_KEY })(model),
    };
  }

  throw new Error("AI provider not supported");
}

export async function chatCompletionObject<T>({
  userAi,
  prompt,
  system,
  schema,
  userEmail,
  usageLabel,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  schema: z.Schema<T>;
  userEmail: string;
  usageLabel: string;
}) {
  try {
    const { provider, model, llmModel } = getModel(userAi);

    const result = await generateObject({
      model: llmModel,
      prompt,
      system,
      schema,
      experimental_telemetry: { isEnabled: true },
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label: usageLabel,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

export async function chatCompletionStream({
  userAi,
  prompt,
  system,
  userEmail,
  usageLabel: label,
  onFinish,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const { provider, model, llmModel } = getModel(userAi);

  const result = await streamText({
    model: llmModel,
    prompt,
    system,
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ usage, text }) => {
      await saveAiUsage({
        email: userEmail,
        provider,
        model,
        usage,
        label,
      });

      if (onFinish) await onFinish(text);
    },
  });

  return result;
}

export async function chatCompletionTools({
  userAi,
  prompt,
  system,
  tools,
  maxSteps,
  label,
  userEmail,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  tools: Record<string, CoreTool>;
  maxSteps?: number;
  label: string;
  userEmail: string;
}) {
  try {
    const { provider, model, llmModel } = getModel(userAi);

    const result = await generateText({
      model: llmModel,
      tools,
      toolChoice: "required",
      prompt,
      system,
      maxSteps,
      experimental_telemetry: { isEnabled: true },
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

async function handleError(error: unknown, userEmail: string) {
  if (APICallError.isInstance(error)) {
    if (isIncorrectOpenAIAPIKeyError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.INCORRECT_OPENAI_API_KEY,
        error.message,
      );
    }

    if (isInvalidOpenAIModelError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.INVALID_OPENAI_MODEL,
        error.message,
      );
    }

    if (isOpenAIAPIKeyDeactivatedError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.OPENAI_API_KEY_DEACTIVATED,
        error.message,
      );
    }

    if (isOpenAIRetryError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.OPENAI_RETRY_ERROR,
        error.message,
      );
    }

    if (isAnthropicInsufficientBalanceError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE,
        error.message,
      );
    }

    if (isGroqInvalidApiKeyError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.GROQ_INVALID_API_KEY,
        error.message,
      );
    }

    if (isGroqRateLimitError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.GROQ_RATE_LIMIT_ERROR,
        error.message,
      );
    }

    if (isGroqQuotaExceededError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.GROQ_QUOTA_EXCEEDED,
        error.message,
      );
    }
  }
}
