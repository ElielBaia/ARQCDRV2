# ARQCdR — Semantic BIM Compiler

Prompt-to-BIM generative platform with deep architectural reasoning.
Brazilian residential focus (NBR 15575), running fully on Azure.

## Stack

| Layer | Technology |
|---|---|
| AI | Azure OpenAI (gpt-4o) — Structured Outputs |
| Database | Azure Cosmos DB (serverless, partitioned on `/userId`) |
| Storage | Azure Blob Storage (export artifacts) |
| Auth | Entra ID (MSAL.js on the SPA, JWKS-verified on the API) |
| Hosting | Azure Container Apps |
| IaC | Bicep + Azure Developer CLI (`azd`) |
| Frontend | React 19 + Vite 6 + Three.js + Tailwind |
| Backend | Express + tsx |

## Local development

### 1. Prerequisites

- Node.js 20+
- An Azure subscription with access to **Azure OpenAI** (request quota first)
- Azure CLI (`az`) + Azure Developer CLI (`azd`)

### 2. Install

```powershell
npm install
```

### 3. Provision Azure resources

**Windows:**
```powershell
./scripts/setup-azure.ps1 -EnvName dev -Location eastus2
```

**Linux / macOS / WSL:**
```bash
./scripts/setup-azure.sh dev eastus2
```

This runs `azd up`, deploys the Bicep stack in `infra/main.bicep`, and writes
the resulting endpoints + keys into `.env.local`.

### 3.1 Use an existing Azure OpenAI resource instead

If you already have an Azure Cognitive Services/OpenAI account, you can skip
provisioning and generate `.env.local` directly from that resource.

**Windows:**
```powershell
./scripts/setup-existing-azure.ps1 -ResourceGroupName ARQCDRGEM -OpenAIResourceName ARQCDRGEMGPT
```

**Linux / macOS / WSL:**
```bash
./scripts/setup-existing-azure.sh ARQCDRGEMGPT ARQCDRGEM
```

This will populate `.env.local` with:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`

If you also have Cosmos and Storage values, provide them via `AZURE_COSMOS_CONNECTION_STRING`
and `AZURE_STORAGE_CONNECTION_STRING`.

If you prefer manual configuration, copy `.env.local.example` to `.env.local` and
fill the values.

### 4. Configure Entra ID (one-time)

Register an application in Entra ID, then fill these values in `.env.local`:

```
AZURE_CLIENT_ID=<application id>
AZURE_CLIENT_SECRET=<client secret>      # only if using the auth-code flow
VITE_AZURE_CLIENT_ID=<application id>
```

Add `http://localhost:3000` and `http://localhost:3000/auth/callback` to the
app's redirect URIs (SPA + Web platforms).

### 5. Run

```powershell
npm run dev
```

The server boots at `http://localhost:3000`. If Cosmos / Entra ID / OpenAI
configs are missing, the server logs a warning and degrades gracefully:

- **No Cosmos** → projects persist in-memory (per session).
- **No Entra ID** → all requests run as `default-user`.
- **No Azure OpenAI** → BIM-compiler endpoints reject with a clear error.

## Production deployment

```powershell
azd deploy
```

The Bicep template provisions: Cosmos DB, Storage, Key Vault, Container Registry,
Azure OpenAI account + `gpt-4o` deployment, Log Analytics, Container Apps
environment, and the Container App itself with system-assigned managed identity
and HTTP autoscaling.

## API surface

| Method | Path | Description |
|---|---|---|
| GET  | `/api/health`                      | Liveness + capability discovery |
| GET  | `/api/me`                          | Resolved user (anonymous OK) |
| POST | `/api/auth/token`                  | Validate an MSAL-acquired access token |
| GET  | `/auth/login`                      | Redirect to Entra ID authorize |
| GET  | `/auth/callback`                   | OAuth2 callback (server-side flow) |
| POST | `/api/projects/from-briefing`      | Compile a PT-BR briefing into a PBIM model |
| POST | `/api/projects/interpret`          | Run the deterministic decoder (invariants only) |
| POST | `/api/projects/validate`           | NBR 15575 validator on an existing project |
| POST | `/api/projects/critic`             | Architectural critic agent |
| POST | `/api/projects/action`             | Conversational mutation of a PBIM model |
| GET  | `/api/projects/:id/model`          | Load a project (falls back to sample) |
| POST | `/api/projects/save`               | Upsert a project for the current user |
| GET  | `/api/projects`                    | List projects for the current user |

## Architecture notes

- The AI pipeline is **not** a thin LLM wrapper: every briefing first passes
  through `src/lib/interpreter/decoder.ts` which extracts architectural
  invariants (zoning, orientation, voids, axes, proportions). Those are then
  injected into the system prompt, and the LLM output is re-validated
  deterministically by `src/lib/interpreter/validator.ts` against NBR 15575.
- `src/lib/pbim/synthesis.ts` enriches the LLM-produced model with topology
  derivations (adjacency edges, area calculations, daylight estimates) before
  it ever reaches the client.
- The critic agent uses seven analytical axes
  (`programa`, `fluxo`, `implantacao`, `tecnica`, `forma`,
  `psicologia_espacial`, `antropometria`) — see `analyzePBIM` in
  `src/lib/azure/openai-agent.ts`.

## Project layout

```
.
├── server-azure.ts                      # Express bootstrap
├── infra/
│   ├── main.bicep                       # Full Azure stack
│   └── main.parameters.json
├── scripts/
│   ├── setup-azure.ps1                  # Windows provisioner
│   └── setup-azure.sh                   # Unix provisioner
├── src/
│   ├── App.tsx
│   ├── components/                      # React UI
│   └── lib/
│       ├── azure/                       # Cosmos / OpenAI / Storage / Auth / MSAL
│       ├── interpreter/                 # Decoder + validator (NBR 15575)
│       ├── knowledge/                   # nbr15575.ts knowledge base
│       ├── pbim/                        # PBIM schema + synthesis
│       └── geometry_engine/             # SVG plans, elevations, sections, DXF, OBJ
└── Dockerfile
```
