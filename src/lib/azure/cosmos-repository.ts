/**
 * Cosmos DB repository for PBIM projects.
 *
 * Partition strategy: `/userId` (Entra ID `oid` claim, "default-user" when the
 * server runs without authentication).
 *
 * Document shape:
 *   {
 *     id:          <projectId — unique within the userId partition>,
 *     userId:      <Entra ID oid OR "default-user">,
 *     name:        <project.name>,
 *     projectData: <full PBIMProject JSON>,
 *     createdAt:   <epoch ms>,
 *     updatedAt:   <epoch ms>,
 *   }
 */

import { CosmosClient, Container } from "@azure/cosmos";
import type { PBIMProject } from "../pbim/schema";

export const ANONYMOUS_USER = "default-user";

export interface IProjectRepository {
  savePBIMProject(project: PBIMProject, userId: string): Promise<void>;
  loadMyProjects(userId: string): Promise<PBIMProject[]>;
  getProject(userId: string, projectId: string): Promise<PBIMProject | null>;
  deleteProject(userId: string, projectId: string): Promise<void>;
  updateProject(project: PBIMProject, userId: string): Promise<void>;
}

interface ProjectDocument {
  id: string;
  userId: string;
  name: string;
  projectData: PBIMProject;
  createdAt: number;
  updatedAt: number;
}

export class CosmosProjectRepository implements IProjectRepository {
  constructor(private readonly container: Container) {}

  async savePBIMProject(project: PBIMProject, userId: string): Promise<void> {
    if (!project.project_id) {
      throw new Error("Cannot persist a PBIMProject without project_id.");
    }
    const now = Date.now();

    // Preserve createdAt if document already exists.
    let createdAt = now;
    try {
      const { resource } = await this.container
        .item(project.project_id, userId)
        .read<ProjectDocument>();
      if (resource?.createdAt) createdAt = resource.createdAt;
    } catch {
      // 404 — first save.
    }

    const doc: ProjectDocument = {
      id: project.project_id,
      userId,
      name: project.name || "Unnamed Project",
      projectData: project,
      createdAt,
      updatedAt: now,
    };

    await this.container.items.upsert(doc);
  }

  async loadMyProjects(userId: string): Promise<PBIMProject[]> {
    const { resources } = await this.container.items
      .query<ProjectDocument>({
        query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.updatedAt DESC",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    return resources.map((doc) => doc.projectData);
  }

  async getProject(userId: string, projectId: string): Promise<PBIMProject | null> {
    try {
      const { resource } = await this.container
        .item(projectId, userId)
        .read<ProjectDocument>();
      return resource?.projectData ?? null;
    } catch (err: any) {
      if (err?.code === 404) return null;
      throw err;
    }
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    try {
      await this.container.item(projectId, userId).delete();
    } catch (err: any) {
      if (err?.code !== 404) throw err;
    }
  }

  async updateProject(project: PBIMProject, userId: string): Promise<void> {
    await this.savePBIMProject(project, userId);
  }
}

let repositoryInstance: CosmosProjectRepository | null = null;

export interface CosmosInitOptions {
  connectionString: string;
  databaseId?: string;
  containerId?: string;
}

export async function initializeCosmosRepository(
  opts: CosmosInitOptions | string
): Promise<CosmosProjectRepository> {
  if (repositoryInstance) return repositoryInstance;

  const options: CosmosInitOptions =
    typeof opts === "string" ? { connectionString: opts } : opts;
  const databaseId = options.databaseId || process.env.AZURE_COSMOS_DATABASE || "arqcdr-db";
  const containerId =
    options.containerId || process.env.AZURE_COSMOS_CONTAINER || "projects";

  const client = new CosmosClient(options.connectionString);

  // Idempotent provisioning so first-run on a fresh resource doesn't error.
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: ["/userId"] },
  });

  repositoryInstance = new CosmosProjectRepository(container);
  console.log(`[Cosmos] Ready (db=${databaseId}, container=${containerId})`);
  return repositoryInstance;
}

export function getCosmosRepository(): CosmosProjectRepository {
  if (!repositoryInstance) {
    throw new Error("Cosmos repository not initialized. Call initializeCosmosRepository first.");
  }
  return repositoryInstance;
}

export function isCosmosReady(): boolean {
  return repositoryInstance !== null;
}
