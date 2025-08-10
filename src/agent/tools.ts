import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolSchema, ToolResult } from "./types";

export type ToolExecutor = (args: unknown) => Promise<ToolResult> | ToolResult;

export type RegisteredTool = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  execute: ToolExecutor;
};

export const TOOLS: Record<string, RegisteredTool> = {};

export function registerTool(tool: RegisteredTool) {
  TOOLS[tool.name] = tool;
}

export function toolSchemasForLLM(): ToolSchema[] {
  return Object.values(TOOLS).map((t) => {
    // Name ensures zod-to-json-schema emits a $ref with a named definition
    const raw = zodToJsonSchema(t.schema, t.name) as any;
    let parameters: unknown = raw as any;
    if (typeof raw === "object" && raw !== null && raw.$ref) {
      const ref: string = raw.$ref as string;
      // Support both "definitions" (draft-07) and "$defs" (2020-12)
      const defs: Record<string, unknown> | undefined = raw.definitions ?? raw.$defs;
      if (defs) {
        const key = ref.replace("#/$defs/", "").replace("#/definitions/", "");
        if (key in defs) parameters = (defs as any)[key];
      }
    }
    // As a fallback, if still not an object schema, wrap into an object with unknown props
    if (
      typeof parameters !== "object" || parameters === null ||
      !("type" in (parameters as any)) || (parameters as any).type !== "object"
    ) {
      parameters = { type: "object", properties: {}, additionalProperties: true };
    }
    return {
      name: t.name,
      description: t.description,
      parameters,
    };
  });
}

// Example tools
const WebSearchArgs = z.object({ query: z.string().min(1) });
registerTool({
  name: "web_search",
  description: "Search the web for information (stub).",
  schema: WebSearchArgs,
  execute: async (args) => {
    const { query } = WebSearchArgs.parse(args);
    return {
      summary: `searched web for: ${query}`,
      result: [
        { title: "Result A", url: "https://example.com" },
        { title: "Result B", url: "https://example.org" },
      ],
    };
  },
});

const CalculatorArgs = z.object({ expression: z.string().min(1) });
registerTool({
  name: "calculator",
  description: "Evaluate a basic arithmetic expression safely.",
  schema: CalculatorArgs,
  execute: async (args) => {
    const { expression } = CalculatorArgs.parse(args);
    try {
      // Use mathjs for safe evaluation
      const { evaluate } = await import("mathjs");
      const val = evaluate(expression);
      return { summary: `evaluated ${expression}`, result: val };
    } catch (e) {
      return { summary: `error evaluating ${expression}` , result: String(e) };
    }
  },
});
