// Resource-group scope: Flex Consumption Function App hosting the MCP server,
// storage (deployment package + API cache table), Key Vault, monitoring, budget.

param location string
param tags object
param environmentName string
param principalId string
param useRbac bool
param flightProvider string
param hotelProvider string
param budgetAmount int
param budgetStartDate string

var token = toLower(uniqueString(subscription().id, resourceGroup().id, environmentName))
var functionAppName = 'func-offsite-mcp-${token}'
var deploymentContainer = 'app-package'
var cacheTable = 'apicache'

// ── Identity ────────────────────────────────────────────────────────────────
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-offsite-mcp-${token}'
  location: location
  tags: tags
}

// ── Storage ─────────────────────────────────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stoffsite${token}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: !useRbac
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainer
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource table 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: cacheTable
}

var storageConnection = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'

// ── Monitoring (daily cap keeps a logging bug from costing money) ────────────
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-offsite-${token}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.1') }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-offsite-${token}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableLocalAuth: useRbac
  }
}

// ── Key Vault: flight API key. Access policies work with Contributor rights. ─
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-offsite-${take(token, 12)}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    accessPolicies: concat(
      [
        {
          tenantId: tenant().tenantId
          objectId: identity.properties.principalId
          permissions: { secrets: ['get'] }
        }
      ],
      empty(principalId)
        ? []
        : [
            {
              tenantId: tenant().tenantId
              objectId: principalId
              permissions: { secrets: ['get', 'list', 'set', 'delete'] }
            }
          ]
    )
  }
}

// ── Function App (Flex Consumption, no Always Ready) ────────────────────────
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'asp-offsite-${token}'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

var storageSettings = useRbac
  ? {
      AzureWebJobsStorage__credential: 'managedidentity'
      AzureWebJobsStorage__clientId: identity.properties.clientId
      AzureWebJobsStorage__blobServiceUri: storage.properties.primaryEndpoints.blob
      AzureWebJobsStorage__tableServiceUri: storage.properties.primaryEndpoints.table
      APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'ClientId=${identity.properties.clientId};Authorization=AAD'
    }
  : {
      AzureWebJobsStorage: storageConnection
      CACHE_TABLE_CONNECTION: storageConnection
    }

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'mcp' })
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: identity.id
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer}'
          authentication: useRbac
            ? { type: 'UserAssignedIdentity', userAssignedIdentityResourceId: identity.id }
            : { type: 'StorageAccountConnectionString', storageAccountConnectionStringName: 'AzureWebJobsStorage' }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 2048
        maximumInstanceCount: 10
      }
      runtime: { name: 'node', version: '22' }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
    }
  }
  dependsOn: [container, table]
}

resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: union(storageSettings, {
    AzureWebJobsFeatureFlags: 'EnableMcpCustomHandlerPreview'
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    AZURE_CLIENT_ID: identity.properties.clientId
    CACHE_TABLE_ENDPOINT: useRbac ? storage.properties.primaryEndpoints.table : ''
    CACHE_TABLE_NAME: cacheTable
    FLIGHT_PROVIDER: flightProvider
    HOTEL_PROVIDER: hotelProvider
    SERPAPI_KEY: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=serpapi-key)'
  })
}

// ── RBAC (only with useRbac=true; needs Owner or RBAC Administrator) ────────
var roles = {
  blobOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  tableContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
  metricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb'
}

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (useRbac) {
  name: guid(storage.id, identity.id, roles.blobOwner)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobOwner)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource tableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (useRbac) {
  name: guid(storage.id, identity.id, roles.tableContributor)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.tableContributor)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource metricsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (useRbac) {
  name: guid(appInsights.id, identity.id, roles.metricsPublisher)
  scope: appInsights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.metricsPublisher)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Budget: alert the resource group owners at 80% and 100% ────────────────
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'budget-offsite-planner'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        contactEmails: []
        contactRoles: ['Owner', 'Contributor']
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: []
        contactRoles: ['Owner', 'Contributor']
      }
    }
  }
}

output functionAppName string = functionApp.name
output mcpEndpoint string = 'https://${functionApp.properties.defaultHostName}/mcp'
output keyVaultName string = vault.name
