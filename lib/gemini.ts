import "server-only";
import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from "@google/genai";

/**
 * Gemini AI client (server-only). Reads `GEMINI_API_KEY` from env on first
 * access; throws if missing so callers fail loudly during dev rather than
 * silently degrading. Override the model per request, or fall back to
 * `GEMINI_MODEL` env / `gemini-2.5-flash` (good free-tier default).
 */

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env to enable AI features.");
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export type ChatTurn = { role: "user" | "model"; text: string };

/**
 * System prompt that anchors the assistant to the Linksy product. Keep
 * concise — long system prompts eat token budget on every turn.
 */
export const LINKSY_SYSTEM_PROMPT = [
  "You are Linksy AI, a creator assistant inside the Linksy social app.",
  "Tone: friendly, concise, on-brand. Match the user's language (English or Mongolian).",
  "Refuse to help with hate speech, harassment, illegal acts, or sexual content involving minors.",
  "Prefer concrete suggestions over generic advice. Keep replies under 200 words unless asked.",
].join(" ");

function toContents(history: ChatTurn[]): Content[] {
  return history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
}

/**
 * Stream a chat completion. Yields partial text chunks as Gemini produces
 * them. Caller is responsible for wiring this to an SSE / ReadableStream
 * response.
 */
export async function* streamChat(args: {
  history: ChatTurn[];
  systemInstruction?: string;
  model?: string;
}): AsyncGenerator<string, void, void> {
  const client = getClient();
  const stream = await client.models.generateContentStream({
    model: args.model ?? DEFAULT_GEMINI_MODEL,
    contents: toContents(args.history),
    config: {
      systemInstruction: args.systemInstruction ?? LINKSY_SYSTEM_PROMPT,
    },
  });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}

/**
 * Tools the agent can invoke to drive the UI. Each one corresponds to a
 * client-side handler in `lib/stores/ai-agent-bridge.ts` (the AI page
 * pushes the call, the destination screen consumes).
 */
export const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: "navigate",
    description: "Navigate the user to an app route (e.g. /create to start a new post, /messages for DMs).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "App path beginning with /" },
      },
      required: ["path"],
    },
  },
  {
    name: "set_post_caption",
    description: "Pre-fill the post caption on /create. Use after navigating to /create.",
    parameters: {
      type: Type.OBJECT,
      properties: { caption: { type: Type.STRING } },
      required: ["caption"],
    },
  },
  {
    name: "set_post_location",
    description: "Pre-fill the post location on /create.",
    parameters: {
      type: Type.OBJECT,
      properties: { location: { type: Type.STRING } },
      required: ["location"],
    },
  },
  {
    name: "set_post_audience",
    description: "Set the post audience on /create.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        audience: { type: Type.STRING, enum: ["PUBLIC", "FRIENDS", "CLOSE_CIRCLE"] },
      },
      required: ["audience"],
    },
  },
  {
    name: "open_image_picker",
    description: "Open the OS file picker on /create so the user can choose an image/video to upload.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "open_story_editor",
    description: "Open the full-screen Story editor modal so the user can compose a Story (24h ephemeral). Works from any page.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export type AgentAction =
  | { name: "navigate"; args: { path: string } }
  | { name: "set_post_caption"; args: { caption: string } }
  | { name: "set_post_location"; args: { location: string } }
  | { name: "set_post_audience"; args: { audience: "PUBLIC" | "FRIENDS" | "CLOSE_CIRCLE" } }
  | { name: "open_image_picker"; args: Record<string, never> }
  | { name: "open_story_editor"; args: Record<string, never> };

const AGENT_SYSTEM_PROMPT = [
  LINKSY_SYSTEM_PROMPT,
  "You can drive the Linksy UI through function calls when the user wants to take action.",
  "Typical flow for 'help me post X with a picture':",
  "  1. Call navigate({ path: '/create' })",
  "  2. Call set_post_caption({ caption: '...' })",
  "  3. Call open_image_picker()",
  "For 'make me a story' / 'create a story about X':",
  "  1. Call open_story_editor()  — opens the full-screen Story composer from any page (no navigation needed).",
  "  2. Tell the user what to add (text/sticker) once it's open.",
  "Only call functions when the user actually asks to perform an action. For information questions or chit-chat, just reply with text.",
  "After calling functions, send a SHORT confirmation sentence so the user knows what you did.",
].join(" ");

/** Single-turn agent call with function calling. Returns text + the
 *  list of function calls Gemini emitted (the client executes them).
 */
export async function generateAgentTurn(args: {
  history: ChatTurn[];
  model?: string;
}): Promise<{ text: string; actions: AgentAction[] }> {
  const client = getClient();
  const response = await client.models.generateContent({
    model: args.model ?? DEFAULT_GEMINI_MODEL,
    contents: toContents(args.history),
    config: {
      systemInstruction: AGENT_SYSTEM_PROMPT,
      tools: [{ functionDeclarations: AGENT_TOOLS }],
    },
  });

  const actions: AgentAction[] = [];
  for (const call of response.functionCalls ?? []) {
    if (!call.name) continue;
    actions.push({ name: call.name, args: (call.args ?? {}) } as AgentAction);
  }

  return { text: response.text ?? "", actions };
}

/**
 * One-shot non-streaming completion, for short utility calls (caption,
 * reply suggestion, summary) where the UI doesn't need a typewriter feel.
 */
export async function generateOnce(args: {
  prompt: string;
  systemInstruction?: string;
  model?: string;
}): Promise<string> {
  const client = getClient();
  const response = await client.models.generateContent({
    model: args.model ?? DEFAULT_GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    config: {
      systemInstruction: args.systemInstruction ?? LINKSY_SYSTEM_PROMPT,
    },
  });
  return response.text ?? "";
}
