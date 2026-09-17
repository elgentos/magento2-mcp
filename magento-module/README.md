# Elgentos_McpMerchant

Companion Magento 2 module for the [merchant MCP tools](../docs/merchant-tools.md). It adds three authenticated, read-only endpoints where the external Node server needs Magento collection or price-index access. No database schema changes, admin UI or scheduled jobs are added.

| REST endpoint | MCP tool | Integration ACL |
| --- | --- | --- |
| `GET /V1/mcp-merchant/search-terms` | `get_search_terms` | `Elgentos_McpMerchant::search_terms` |
| `GET /V1/mcp-merchant/reviews` | `get_product_reviews` | `Elgentos_McpMerchant::reviews` |
| `GET /V1/mcp-merchant/prices` | `get_product_prices` | `Elgentos_McpMerchant::prices` |

Requires PHP 8.1+ and Magento 2.4 with the Catalog, Customer, Review, Search and Store modules. Typed service contracts preserve nested REST objects, including review ratings. Local checks cover the standalone code/contracts; installation and database-backed behavior must be verified against the target Magento environment.

## Install from this checkout

Run these commands from your **Magento project**, substituting the path to this MCP checkout:

```bash
composer config repositories.elgentos-mcp-merchant path /absolute/path/to/magento2-mcp/magento-module
composer require elgentos/module-mcp-merchant:1.0.0
bin/magento module:enable Elgentos_McpMerchant
bin/magento setup:upgrade
bin/magento cache:clean
```

For deployments, make the module available in the deployment artifact; a Composer path repository can otherwise refer to a local path/symlink absent on the server. Include `bin/magento setup:di:compile` in the normal production build.

Alternatively, copy the contents of this directory to `app/code/Elgentos/McpMerchant` in the Magento project, then enable the module and run the same Magento setup/build steps. Use one installation method.

In **System → Integrations**, grant the existing MCP integration the needed resources under **MCP Merchant Reports**. The module's endpoints do not allow anonymous access. Reauthorize the integration if required after changing its resource grants, then reuse that integration token in `MAGENTO_API_TOKEN`. Restart the Node MCP server and refresh the client's tools.

## Endpoint parameters

All responses have `items` and `total_count`; list pagination is 1-based, with `pageSize` 1–500 (default 100) and `currentPage` default 1.

- Search terms: `storeId` (0 = all), `query`, `zeroResultsOnly` (false), `minPopularity` (0), pagination. Returns stored cumulative popularity and result counts, not period-specific search analytics.
- Reviews: required `sku`, `storeId` (0 = all), `status` (`all`, `approved`, `pending`, `not_approved`), pagination. Reads product reviews and their rating votes using the requested store scope.
- Prices: required `skus[]` (1–100) and positive `storeId`, `customerGroupId` (0), `quantity` (1). Uses the store's website and current price index, and eligible configured tier prices. Returns website base currency and the catalog tax configuration. Does not simulate checkout shipping, cart discounts, address-specific tax, custom options or historic/future pricing. Keep catalog indexes up to date. Composites return ranges, not a fabricated unit price.

The Node tools translate snake_case arguments to these REST names. Standard base URLs such as `https://shop.example/rest/V1` continue to work; explicit `storeId` sets the requested reporting context.

## Local verification

From the MCP checkout:

```bash
npm test
npm run test:php
composer validate --no-check-publish magento-module/composer.json
```

The PHP tests run without Magento or a database. After installing the module in a test Magento environment, verify all three tools with the intended integration permissions, stock/store/customer-group configuration and indexed products before deploying through your normal process.
