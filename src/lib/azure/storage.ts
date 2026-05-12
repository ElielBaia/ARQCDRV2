import { BlobServiceClient, BlockBlobClient } from "@azure/storage-blob";

let blobServiceClient: BlobServiceClient | null = null;

export function initializeAzureStorage(connectionString: string): BlobServiceClient {
  if (blobServiceClient) {
    return blobServiceClient;
  }

  blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  console.log("[Azure Blob Storage] Client initialized successfully");
  return blobServiceClient;
}

export function getAzureStorageClient(): BlobServiceClient {
  if (!blobServiceClient) {
    throw new Error("Azure Storage client not initialized. Call initializeAzureStorage first.");
  }
  return blobServiceClient;
}

export async function uploadExport(
  fileName: string,
  buffer: Buffer,
  contentType: string,
  userId?: string
): Promise<string> {
  const client = getAzureStorageClient();
  const containerClient = client.getContainerClient("exports");

  const blobName = userId ? `${userId}/${fileName}` : fileName;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    console.log(`[Azure Blob] Uploaded: ${blobName}`);
    return blockBlobClient.url;
  } catch (error) {
    throw new Error(
      `Failed to upload export: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function deleteExport(fileName: string, userId?: string): Promise<void> {
  const client = getAzureStorageClient();
  const containerClient = client.getContainerClient("exports");

  const blobName = userId ? `${userId}/${fileName}` : fileName;

  try {
    await containerClient.deleteBlob(blobName);
    console.log(`[Azure Blob] Deleted: ${blobName}`);
  } catch (error) {
    throw new Error(
      `Failed to delete export: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function listExports(userId: string): Promise<string[]> {
  const client = getAzureStorageClient();
  const containerClient = client.getContainerClient("exports");

  const exports: string[] = [];

  try {
    for await (const blob of containerClient.listBlobsFlat({ prefix: `${userId}/` })) {
      exports.push(blob.name);
    }
    return exports;
  } catch (error) {
    throw new Error(
      `Failed to list exports: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function getExportUrl(fileName: string, userId?: string): Promise<string> {
  const client = getAzureStorageClient();
  const containerClient = client.getContainerClient("exports");

  const blobName = userId ? `${userId}/${fileName}` : fileName;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  return blockBlobClient.url;
}
