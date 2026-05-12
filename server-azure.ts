/**
 * ARQCdR Semantic BIM Server — Azure edition.
 *
 * Boot order:
 *   1. Load env (.env.local).
 *   2. Initialize Azure services that have credentials configured. Each
 *      service is optional in local development; missing configs degrade
 *      gracefully (e.g. Cosmos absent → in-memory project state).
 *   3. Mount routes:
 *      - /api/health                    (no auth)
 *      - /auth/login, /auth/callback    (Entra ID OAuth2)
 *      - /api/projects/*                (auth optional — passes user.id to repo)
 *   4. Vite middleware in dev, static dist in production.
 */

import dotenv from "dotenv";
import fs from "fs";
import express, { type Request, type Response } from "express";
import path from "path";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
} else {
  dotenv.config({ override: true });
}

import { projetoTestePDF } from "./src/lib/pbim/fixtures/projeto_teste_pdf";

import {
  initializeCosmosRepository,
  getCosmosRepository,
  isCosmosReady,
  ANONYMOUS_USER,
} from "./src/lib/azure/cosmos-repository";
import { initializeAzureStorage } from "./src/lib/azure/storage";
import {
  initializeAzureOpenAI,
  isAzureOpenAIConfigured,
  parseBriefingToPBIMEnriched,
  analyzePBIM,
  mutatePBIM,
} from "./src/lib/azure/openai-agent";
import {
  initializeEntraId,
  isEntraIdConfigured,
  requireAuth,
  getAuthorizationUrl,
  exchangeCodeForToken,
  verifyAccessToken,
  claimsToUser,
} from "./src/lib/azure/auth";
import { BuildingSynthesisEngine } from "./src/lib/pbim/synthesis";

// ---------------------------------------------------------------------------
// Local fallback state — used when Cosmos isn't configured (offline dev).
// Keyed by userId so multiple anonymous sessions don't trample each other.
// ---------------------------------------------------------------------------
const localState = new Map<string, Map<string, any>>();

function localSave(userId: string, projectId: string, project: any): void {
  if (!localState.has(userId)) localState.set(userId, new Map());
  localState.get(userId)!.set(projectId, project);
}
function localGet(userId: string, projectId: string): any | null {
  return localState.get(userId)?.get(projectId) ?? null;
}
function localList(userId: string): any[] {
  return Array.from(localState.get(userId)?.values() ?? []);
}

// Seed: the canonical sample project available to anonymous users.
const SAMPLE_PROJECT_ID = "sample";
localSave(
  ANONYMOUS_USER,
  SAMPLE_PROJECT_ID,
  JSON.parse(JSON.stringify(projetoTestePDF))
);

// ---------------------------------------------------------------------------
// Azure service bootstrap
// ---------------------------------------------------------------------------

async function initializeAzureServices() {
  const cosmosConn = process.env.AZURE_COSMOS_CONNECTION_STRING;
  if (cosmosConn) {
    try {
      await initializeCosmosRepository({ connectionString: cosmosConn });
    } catch (err) {
      console.warn("[Server] Cosmos init failed; falling back to in-memory:", err);
    }
  } else {
    console.log("[Server] AZURE_COSMOS_CONNECTION_STRING not set — in-memory project store active.");
  }

  const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (storageConn) {
    try {
      initializeAzureStorage(storageConn);
    } catch (err) {
      console.warn("[Server] Storage init failed:", err);
    }
  }

  if (isAzureOpenAIConfigured()) {
    try {
      initializeAzureOpenAI();
    } catch (err) {
      console.warn("[Server] Azure OpenAI init failed:", err);
    }
  } else {
    console.warn(
      "[Server] AZURE_OPENAI_ENDPOINT/AZURE_OPENAI_API_KEY not set — BIM compiler will throw on use."
    );
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  if (tenantId && clientId) {
    initializeEntraId({
      tenantId,
      clientId,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      redirectUri: process.env.AZURE_REDIRECT_URI,
      audience: process.env.AZURE_TOKEN_AUDIENCE,
    });
  } else {
    console.log(
      "[Server] Entra ID not configured — endpoints run anonymously (userId=default-user)."
    );
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers — opaque to the route handlers so the same code path
// works whether or not Cosmos is online.
// ---------------------------------------------------------------------------

async function persistProject(userId: string, project: any): Promise<void> {
  if (isCosmosReady()) {
    try {
      await getCosmosRepository().savePBIMProject(project, userId);
      return;
    } catch (err) {
      console.warn("[persistProject] Cosmos write failed, mirroring locally:", err);
    }
  }
  localSave(userId, project.project_id || "current", project);
}

async function loadProject(userId: string, projectId: string): Promise<any | null> {
  if (isCosmosReady()) {
    try {
      const project = await getCosmosRepository().getProject(userId, projectId);
      if (project) return project;
    } catch (err) {
      console.warn("[loadProject] Cosmos read failed:", err);
    }
  }
  return localGet(userId, projectId);
}

async function listProjectsFor(userId: string): Promise<any[]> {
  if (isCosmosReady()) {
    try {
      return await getCosmosRepository().loadMyProjects(userId);
    } catch (err) {
      console.warn("[listProjectsFor] Cosmos query failed:", err);
    }
  }
  return localList(userId);
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

  await initializeAzureServices();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // -------------------------------------------------------------------------
  // Health & capability discovery
  // -------------------------------------------------------------------------
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Semantic Engine Online",
      capabilities: {
        cosmos: isCosmosReady(),
        azureOpenAI: isAzureOpenAIConfigured(),
        entraId: isEntraIdConfigured(),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Entra ID OAuth2 — Authorization Code flow
  // -------------------------------------------------------------------------
  app.get("/auth/login", (req, res) => {
    if (!isEntraIdConfigured()) {
      return res.status(503).json({ error: "Entra ID is not configured on this server." });
    }
    const redirectUri = process.env.AZURE_REDIRECT_URI || `${publicBase}/auth/callback`;
    const state = String(req.query.state || "");
    const url = getAuthorizationUrl(redirectUri, ["openid", "profile", "email"], state);
    res.redirect(url);
  });

  app.get("/auth/callback", async (req, res) => {
    try {
      const code = String(req.query.code || "");
      if (!code) return res.status(400).send("Missing authorization code.");
      const redirectUri = process.env.AZURE_REDIRECT_URI || `${publicBase}/auth/callback`;
      const tokens = await exchangeCodeForToken(code, redirectUri);

      // Echo tokens to the SPA via a brief HTML bridge that stores them and
      // navigates back to the root. The frontend will pick them up.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html><body><script>
window.opener && window.opener.postMessage(${JSON.stringify({ kind: "arqcdr:auth", tokens })}, window.location.origin);
sessionStorage.setItem('arqcdr.tokens', ${JSON.stringify(JSON.stringify(tokens))});
window.location.replace('/');
</script>Authenticated. Redirecting…</body></html>`);
    } catch (err: any) {
      console.error("[Auth] callback failed:", err);
      res.status(500).send(`Auth failed: ${err?.message || "unknown error"}`);
    }
  });

  app.get("/api/me", requireAuth({ optional: true }), async (req, res) => {
    res.json({ user: req.user || null, anonymous: req.user?.id === ANONYMOUS_USER });
  });

  app.post("/api/auth/token", async (req: Request, res: Response) => {
    // Validates a token submitted by the SPA (after MSAL acquires one).
    const token = String(req.body?.token || "");
    if (!token) return res.status(400).json({ error: "Missing token." });
    if (!isEntraIdConfigured()) {
      return res.status(503).json({ error: "Entra ID is not configured." });
    }
    try {
      const claims = await verifyAccessToken(token);
      return res.json({ user: claimsToUser(claims), valid: true });
    } catch (err: any) {
      return res.status(401).json({ valid: false, error: err?.message });
    }
  });

  // -------------------------------------------------------------------------
  // BIM compiler endpoints
  // -------------------------------------------------------------------------

  app.post(
    "/api/projects/from-briefing",
    requireAuth({ optional: true }),
    async (req, res) => {
      try {
        const prompt = String(req.body?.prompt || "").trim();
        if (!prompt) return res.status(400).json({ error: "Missing prompt." });

        console.log("[BIMCompiler] Briefing received, invoking ARQCdR + Azure OpenAI…");
        const enriched = await parseBriefingToPBIMEnriched(prompt);
        enriched.project = BuildingSynthesisEngine.enrich(enriched.project);

        console.log(
          `[BIMCompiler] Pattern=${enriched.interpreter.pattern}; validation=${enriched.validation.status}`
        );

        const userId = req.user?.id || ANONYMOUS_USER;
        await persistProject(userId, enriched.project);

        res.json({
          ...enriched.project,
          _arqcdr: {
            interpreter: enriched.interpreter,
            validation: enriched.validation,
          },
        });
      } catch (err: any) {
        console.error("[BIMCompiler Error]", err);
        res.status(500).json({ error: err?.message || "Failed to generate project model." });
      }
    }
  );

  app.post("/api/projects/validate", async (req, res) => {
    try {
      const { project } = req.body || {};
      if (!project) return res.status(400).json({ error: "Missing project." });
      const { validateProject } = await import("./src/lib/interpreter/validator");
      res.json(validateProject(project));
    } catch (err: any) {
      console.error("[Validator Error]", err);
      res.status(500).json({ error: err?.message || "Failed to validate." });
    }
  });

  app.post("/api/projects/interpret", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      if (!prompt) return res.status(400).json({ error: "Missing prompt." });
      const { buildInvariantSet } = await import("./src/lib/interpreter/decoder");
      res.json(buildInvariantSet(prompt));
    } catch (err: any) {
      console.error("[Interpreter Error]", err);
      res.status(500).json({ error: err?.message || "Failed to interpret." });
    }
  });

  app.post("/api/projects/critic", async (req, res) => {
    try {
      const { project, svgStr } = req.body || {};
      if (!project) return res.status(400).json({ error: "Missing project." });

      console.log("[ArchitecturalCritic] Generating critic report…");
      const report = await analyzePBIM(project, svgStr);
      res.json(report);
    } catch (err: any) {
      console.error("[ArchitecturalCritic Error]", err);
      res.status(500).json({ error: err?.message || "Failed to generate critic report." });
    }
  });

  app.post(
    "/api/projects/action",
    requireAuth({ optional: true }),
    async (req, res) => {
      try {
        const { prompt, currentProject, svgStr } = req.body || {};
        if (!prompt || !currentProject) {
          return res.status(400).json({ error: "Missing parameters." });
        }

        console.log("[RebornAgent] Mutating project…");
        const updated = await mutatePBIM(currentProject, prompt, svgStr);
        const enriched = BuildingSynthesisEngine.enrich(updated);
        console.log("[RebornAgent] Mutation complete.");

        const userId = req.user?.id || ANONYMOUS_USER;
        await persistProject(userId, enriched);

        res.json({
          actionAlert: { explanation: "Model updated via Reborn Conversational AI." },
          updatedModel: enriched,
        });
      } catch (err: any) {
        console.error("[RebornAgent Error]", err);
        res.status(500).json({ error: err?.message || "Failed to mutate PBIM." });
      }
    }
  );

  // Single source of truth for fetching a project by id, including the
  // anonymous "sample" used as initial canvas content.
  app.get(
    "/api/projects/:id/model",
    requireAuth({ optional: true }),
    async (req, res) => {
      try {
        const userId = req.user?.id || ANONYMOUS_USER;
        const { id } = req.params;

        // 1) authenticated user's own copy
        let project = await loadProject(userId, id);

        // 2) fall back to the shared anonymous sample for first-render content
        if (!project) {
          project = await loadProject(ANONYMOUS_USER, id);
        }

        // 3) last-resort seed
        if (!project) {
          project = JSON.parse(JSON.stringify(projetoTestePDF));
        }

        res.json(project);
      } catch (err: any) {
        console.error("[Project Retrieval Error]", err);
        res.status(500).json({ error: err?.message || "Failed to retrieve project." });
      }
    }
  );

  app.post(
    "/api/projects/save",
    requireAuth({ optional: true }),
    async (req, res) => {
      try {
        const { project } = req.body || {};
        if (!project) return res.status(400).json({ error: "Missing project data." });
        const userId = req.user?.id || ANONYMOUS_USER;
        await persistProject(userId, project);
        res.json({
          success: true,
          message: isCosmosReady() ? "Project saved to Cosmos DB." : "Project saved in-memory.",
          projectId: project.project_id,
          userId,
          persisted: isCosmosReady(),
        });
      } catch (err: any) {
        console.error("[ProjectSave Error]", err);
        res.status(500).json({ error: err?.message || "Failed to save project." });
      }
    }
  );

  app.get(
    "/api/projects",
    requireAuth({ optional: true }),
    async (req, res) => {
      try {
        const userId = req.user?.id || ANONYMOUS_USER;
        const list = await listProjectsFor(userId);
        res.json(list);
      } catch (err: any) {
        console.error("[ProjectList Error]", err);
        res.status(500).json({ error: err?.message || "Failed to list projects." });
      }
    }
  );

  // -------------------------------------------------------------------------
  // Frontend (Vite dev middleware OR static dist)
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
    console.log(`[ARQCdR] Semantic Engine listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[ARQCdR] Fatal boot error:", err);
  process.exit(1);
});
