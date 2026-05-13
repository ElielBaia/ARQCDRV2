import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { PBIMProject } from "../pbim/schema";

/**
 * ARQCdR Semantic BIM Compiler — Google Gemini implementation.
 */

let genAI: GoogleGenerativeAI | null = null;

export function initializeGemini() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] GOOGLE_GENERATIVE_AI_API_KEY not set. AI features will be unavailable.");
    return;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  console.log("[Gemini] Client initialized.");
}

export function isGeminiConfigured(): boolean {
  return !!genAI;
}

const PBIM_GENERATION_PROMPT = `
You are an expert Architectural AI. Your task is to transform a natural language architectural briefing into a PBIM (Pre-BIM) JSON model.
The PBIM model represents the early-stage topological and spatial intent of a building.

Instructions:
1. Extract levels, spaces, walls, and slabs from the prompt.
2. Ensure the topological relations (boundary walls) are consistent.
3. If specific dimensions are missing, use reasonable architectural defaults (e.g., 3.0m wall height, 0.15m thickness).
4. Output ONLY the valid PBIM JSON.

Return the response in the specified JSON format.
`;

export async function parseBriefingToPBIM(prompt: string): Promise<PBIMProject> {
  if (!genAI) throw new Error("Gemini is not configured.");

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([PBIM_GENERATION_PROMPT, `Briefing: ${prompt}`]);
  const response = result.response;
  const text = response.text();

  try {
    return JSON.parse(text) as PBIMProject;
  } catch (err) {
    console.error("[Gemini] Failed to parse JSON response:", text);
    throw new Error("Failed to extract valid PBIM from Gemini response.");
  }
}

export async function analyzePBIM(project: PBIMProject, svgStr?: string): Promise<string> {
  if (!genAI) throw new Error("Gemini is not configured.");

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    Analyze the following PBIM architectural model and provide a critical report.
    Focus on spatial efficiency, structural logic, and architectural quality.

    Project Data: ${JSON.stringify(project)}
    ${svgStr ? `Visual context (SVG): ${svgStr}` : ""}

    Provide a professional architectural critique.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function mutatePBIM(project: PBIMProject, mutationPrompt: string, svgStr?: string): Promise<PBIMProject> {
  if (!genAI) throw new Error("Gemini is not configured.");

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = `
    You are an Architectural AI. Modify the existing PBIM model according to the user request.
    Current Model: ${JSON.stringify(project)}
    Request: ${mutationPrompt}
    ${svgStr ? `Visual context (SVG): ${svgStr}` : ""}

    Return the UPDATED PBIM JSON.
  `;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text) as PBIMProject;
  } catch (err) {
    console.error("[Gemini] Failed to parse mutated JSON:", text);
    throw new Error("Failed to mutate PBIM via Gemini.");
  }
}
