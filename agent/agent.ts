import { defineAgent } from "eve";
import { chatgpt } from "eve/models/openai";

export default defineAgent({
  model: chatgpt(),
  reasoning: "low",
  defaultTools: false,
  tool: false,
  limits: { maxInputTokensPerSession: 12000, maxOutputTokensPerSession: 2000, sessionTimeoutMs: 600000 },
});
