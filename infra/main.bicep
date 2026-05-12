metadata description = 'ARQCdR — Azure infrastructure (Container Apps + Cosmos DB + Storage + Azure OpenAI + Key Vault).'

@description('Deployment environment name (dev | stg | prod).')
param environment string = 'dev'

@description('Azure region.')
param location string = resourceGroup().location

@description('Project / resource name prefix.')
param projectName string = 'arqcdr'

@description('Container image tag pushed to ACR (without the registry hostname).')
param containerImage string = 'arqcdr:latest'

@description('Tenant ID for Entra ID authentication. Pass empty to disable auth.')
param azureTenantId string = subscription().tenantId

@description('Client (app) ID registered in Entra ID. Pass empty to disable auth.')
param azureClientId string = ''

@secure()
@description('Client secret for the Entra ID app (server-side auth-code flow). Optional.')
param azureClientSecret string = ''

@description('Azure OpenAI model name to deploy (e.g. gpt-4o-mini).')
param openAiModelName string = 'gpt-4o-mini'

@description('Azure OpenAI model version (publisher-provided).')
param openAiModelVersion string = '2024-08-06'

@description('Azure OpenAI deployment SKU (Standard | GlobalStandard).')
param openAiSkuName string = 'Standard'

@description('TPM capacity (thousands of tokens / min) for the model deployment.')
param openAiCapacity int = 1

var cosmosDbName = '${projectName}-cosmos-${environment}'
var containerRegistryName = toLower(replace('${projectName}acr${environment}', '-', ''))
var keyVaultName = '${projectName}-kv-${environment}'
var storageAccountName = toLower(replace('${projectName}st${environment}', '-', ''))
var openAiName = '${projectName}-openai-${environment}'
var containerEnvironmentName = '${projectName}-env-${environment}'
var containerAppName = '${projectName}-app-${environment}'

// ===========================================================================
// Container Registry
// ===========================================================================
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
}

// ===========================================================================
// Cosmos DB (serverless)
// ===========================================================================
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosDbName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'arqcdr-db'
  properties: {
    resource: { id: 'arqcdr-db' }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'projects'
  properties: {
    resource: {
      id: 'projects'
      partitionKey: {
        paths: [ '/userId' ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/projectData/*' } ]
      }
      defaultTtl: -1
    }
  }
}

// ===========================================================================
// Key Vault — stores all sensitive runtime secrets.
// ===========================================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: false
  }
}

resource cosmosConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'CosmosDbConnectionString'
  properties: {
    value: cosmos.listConnectionStrings().connectionStrings[0].connectionString
  }
}

// ===========================================================================
// Storage Account (Blob — exports container)
// ===========================================================================
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'exports'
  properties: { publicAccess: 'None' }
}

resource storageConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'StorageConnectionString'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
  }
}

// ===========================================================================
// Azure OpenAI (Cognitive Services) + Deployment
// ===========================================================================
resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: openAiModelName
  sku: {
    name: openAiSkuName
    capacity: openAiCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

resource openAiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AzureOpenAIApiKey'
  properties: {
    value: openAi.listKeys().key1
  }
}

resource entraClientSecretKv 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(azureClientSecret)) {
  parent: keyVault
  name: 'AzureClientSecret'
  properties: {
    value: azureClientSecret
  }
}

// ===========================================================================
// Container Apps Environment + App
// ===========================================================================
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${projectName}-log-${environment}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        traffic: [
          { latestRevision: true, weight: 100 }
        ]
      }
      registries: [
        {
          server: '${containerRegistry.name}.azurecr.io'
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
        {
          name: 'cosmos-connection'
          value: cosmos.listConnectionStrings().connectionStrings[0].connectionString
        }
        {
          name: 'storage-connection'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
        }
        {
          name: 'openai-key'
          value: openAi.listKeys().key1
        }
        {
          name: 'entra-client-secret'
          value: empty(azureClientSecret) ? 'unset' : azureClientSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: '${containerRegistry.name}.azurecr.io/${containerImage}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: environment == 'prod' ? 'production' : 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'AZURE_COSMOS_CONNECTION_STRING', secretRef: 'cosmos-connection' }
            { name: 'AZURE_COSMOS_DATABASE', value: 'arqcdr-db' }
            { name: 'AZURE_COSMOS_CONTAINER', value: 'projects' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-connection' }
            { name: 'AZURE_STORAGE_CONTAINER', value: 'exports' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: openAi.properties.endpoint }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'openai-key' }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: openAiModelName }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2024-10-21' }
            { name: 'AZURE_TENANT_ID', value: azureTenantId }
            { name: 'AZURE_CLIENT_ID', value: azureClientId }
            { name: 'AZURE_CLIENT_SECRET', secretRef: 'entra-client-secret' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 3000 }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: 3000 }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scale'
            http: { metadata: { concurrentRequests: '30' } }
          }
        ]
      }
    }
  }
}

// ===========================================================================
// Outputs
// ===========================================================================
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output cosmosDbEndpoint string = cosmos.properties.documentEndpoint
output storageAccountName string = storageAccount.name
output keyVaultUrl string = keyVault.properties.vaultUri
output containerRegistryUrl string = 'https://${containerRegistry.name}.azurecr.io'
output azureOpenAIEndpoint string = openAi.properties.endpoint
output azureOpenAIDeployment string = openAiModelName
output containerAppPrincipalId string = containerApp.identity.principalId
