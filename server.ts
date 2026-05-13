/**
 * ARQCdR Semantic BIM Server — Google Gemini edition.
 */

import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";

// Load environment variables
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
} else {
  dotenv.config({ override: true });
}

import { projetoTestePDF } from "./src/lib/pbim/fixtures/projeto_teste_pdf";
import {
  initializeGemini,
  isGeminiConfigured,
  parseBriefingToPBIM,
  analyzePBIM,
  mutatePBIM
} from "./src/lib/ai/gemini-agent";
import { BuildingSynthesisEngine } from "./src/lib/pbim/synthesis";

// ---------------------------------------------------------------------------
// In-Memory Persistence
// ---------------------------------------------------------------------------
const localProjects = new Map<string, any>();
const ANONYMOUS_USER = "default-user";

// Seed with sample project
const SAMPLE_PROJECT_ID = "sample";
localProjects.set(SAMPLE_PROJECT_ID, JSON.parse(JSON.stringify(projetoTestePDF)));

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  initializeGemini();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "ARQCdR Semantic Engine (Google Edition) Online",
      capabilities: {
        gemini: isGeminiConfigured(),
        storage: "in-memory"
      },
    });
  });

  // Mock User Identity
  app.get("/api/me", (req, res) => {
    res.json({ user: { id: ANONYMOUS_USER, name: "Local User" }, anonymous: true });
  });

  // -------------------------------------------------------------------------
  // Project Endpoints
  // -------------------------------------------------------------------------

  app.post("/api/projects/from-briefing", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      if (!prompt) return res.status(400).json({ error: "Missing prompt." });

      console.log("[BIMCompiler] Briefing received, invoking Gemini…");
      const project = await parseBriefingToPBIM(prompt);
      const enriched = BuildingSynthesisEngine.enrich(project);

      localProjects.set(enriched.project_id || "latest", enriched);

      res.json(enriched);
    } catch (err: any) {
      console.error("[BIMCompiler Error]", err);
      res.status(500).json({ error: err?.message || "Failed to generate project model." });
    }
  });

  app.post("/api/projects/critic", async (req, res) => {
    try {
      const { project, svgStr } = req.body || {};
      if (!project) return res.status(400).json({ error: "Missing project." });

      console.log("[ArchitecturalCritic] Generating report via Gemini…");
      const report = await analyzePBIM(project, svgStr);
      res.json({ report });
    } catch (err: any) {
      console.error("[ArchitecturalCritic Error]", err);
      res.status(500).json({ error: err?.message || "Failed to generate critic report." });
    }
  });

  app.post("/api/projects/action", async (req, res) => {
    try {
      const { prompt, currentProject, svgStr } = req.body || {};
      if (!prompt || !currentProject) {
        return res.status(400).json({ error: "Missing parameters." });
      }

      console.log("[Agent] Mutating project via Gemini…");
      const updated = await mutatePBIM(currentProject, prompt, svgStr);
      const enriched = BuildingSynthesisEngine.enrich(updated);

      localProjects.set(enriched.project_id || "latest", enriched);

      res.json({
        actionAlert: { explanation: "Model updated via Gemini AI." },
        updatedModel: enriched,
      });
    } catch (err: any) {
      console.error("[Mutation Error]", err);
      res.status(500).json({ error: err?.message || "Failed to mutate project." });
    }
  });

  app.get("/api/projects/:id/model", (req, res) => {
    const project = localProjects.get(req.params.id) || localProjects.get(SAMPLE_PROJECT_ID);
    res.json(project);
  });

  app.post("/api/projects/save", (req, res) => {
    const { project } = req.body || {};
    if (!project) return res.status(400).json({ error: "Missing project data." });
    localProjects.set(project.project_id, project);
    res.json({ success: true, projectId: project.project_id });
  });

  app.get("/api/projects", (req, res) => {
    res.json(Array.from(localProjects.values()));
  });

  // -------------------------------------------------------------------------
  // Static Frontend
  // -------------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ARQCdR] Server (Google Edition) listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[ARQCdR] Fatal boot error:", err);
  process.exit(1);
});
