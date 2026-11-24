// Offsite Planner connector infrastructure (subscription scope, azd).
// One resource group; everything else lives in resources.bicep.

targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('azd environment name')
param environmentName string

@description('Region for all resources (Flex Consumption must be available there)')
param location string = 'westeurope'

@description('Resource group name')
param resourceGroupName string = 'rg-offsite-planner'

@description('Object ID of the deploying user; gets Key Vault secret access so the flight API key can be set')
param principalId string = ''

@description('true: managed identity + RBAC for storage and App Insights (needs Owner or RBAC Administrator on the resource group). false: connection strings (works with Contributor).')
param useRbac bool = false

@allowed(['mock', 'serpapi'])
@description('Flight data source. serpapi needs the serpapi-key secret in Key Vault.')
param flightProvider string = 'mock'

@allowed(['mock', 'serpapi'])
@description('Hotel data source. serpapi uses the same serpapi-key secret.')
param hotelProvider string = 'mock'

@description('Optional Owner tag, for subscriptions whose policy requires one on resource groups')
param ownerTag string = ''

@description('Monthly cost alert in USD for the resource group')
param budgetAmount int = 5

@description('First day of the budget period (YYYY-MM-01), e.g. the first day of this month. Keep it fixed; a budget start date cannot be moved later.')
param budgetStartDate string

var tags = union({ 'azd-env-name': environmentName, project: 'offsite-planner' }, empty(ownerTag) ? {} : { Owner: ownerTag })

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    environmentName: environmentName
    principalId: principalId
    useRbac: useRbac
    flightProvider: flightProvider
    hotelProvider: hotelProvider
    budgetAmount: budgetAmount
    budgetStartDate: budgetStartDate
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output SERVICE_MCP_NAME string = resources.outputs.functionAppName
output SERVICE_MCP_ENDPOINT string = resources.outputs.mcpEndpoint
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
