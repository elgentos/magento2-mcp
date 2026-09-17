# Magento 2 MCP Server

This is a Model Context Protocol (MCP) server that connects to Magento 2, allowing Claude and other MCP clients to analyze sales, customers, inventory and marketing, and manage product attributes and CMS content.

The [merchant tools guide](docs/merchant-tools.md) documents the 24 tools added from priorities 1 and 2 of the [Magento MCP comparison](docs/mcp-merchant-comparison.nl.md), their filters and calculation definitions. Contextual prices, search terms and reviews require the bundled [Magento module](magento-module/README.md).

## Features

### Product Features
- Query product information by SKU or ID
- Search for products using various criteria
- Get product categories
- Get related products
- Get product stock information
- Get product attributes
- Update product attributes by specifying attribute code and value
- Advanced product search with filtering and sorting

### Customer Features
- Get all ordered products for a customer by email address
- Search customer profiles, addresses and groups
- Analyze top, new, returning and inactive buyers using earlier order history
- Inspect active and abandoned carts with items, totals and an inactivity threshold

### Merchant Operations
- Read MSI salable stock and source quantities; find low-stock products and estimate stock duration
- Read promotions, coupons and order-based coupon performance
- Read contextual customer-group prices and configured quantity tiers
- Search CMS pages/blocks and update page content and metadata
- Analyze storefront search terms without results and read product reviews

### Order and Revenue Features
- Get order count for specific date ranges
- Get revenue for specific date ranges
- Get revenue filtered by country for specific date ranges
- Get product sales statistics including quantity sold and top-selling products
- Retrieve all sold products with pagination, SKU/category filters and revenue sorting
- List orders with their order lines and retrieve individual orders
- Analyze sales by category, with monthly revenue, quantities and category contribution per order
- Get monthly revenue, order count and average order value in one tool call
- Analyze credit memos and optionally deduct refunds by refund date or original order date
- Inspect payments, invoices, shipments, tracking and order status history
- Support for relative date expressions like "today", "yesterday", "last week", "this month", "last 18 months", "YTD"
- Support for country filtering using both country codes and country names

## Prerequisites

- Node.js 18 or higher (use a supported LTS release)
- A Magento 2 instance with REST API access
- API token for the Magento 2 instance

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

## Usage

### Running the server directly

```bash
node mcp-server.js
```

### Testing with the test client

```bash
node test-mcp-server.js
```

### Using with Claude Desktop

1. Check your path node with `which node`
2. Go to the Developer settings and click "Edit config". This will open a JSON file.
3. Add the following snippet within the `mcpServers`:

```
    "magento2": {
      "command": "/path/to/your/node",
      "args": ["/path/to/mcp-server.js"],
      "env": {
        "MAGENTO_BASE_URL": "https://YOUR_DOMAIN/rest/V1",
        "MAGENTO_API_TOKEN": "your-api-token"
      }
    }
```

3. Replace `/path/to/your/node` with the path you checked in step 1
4. Replace `/path/to/mcp-server.js` with the path where you cloned this repo
5. You can get an API token from System > Integrations in the Magento admin
6. Restart Claude Desktop.
7. You should now be able to ask Claude questions about products in your Magento store.

## Available Tools

The server exposes the following tools:

### Product Tools
- `get_product_by_sku`: Get detailed information about a product by its SKU
- `search_products`: Search for products using Magento search criteria
- `get_product_categories`: Get categories for a specific product by SKU
- `get_categories`: List category IDs, names, parent IDs and levels, with pagination
- `get_related_products`: Get products related to a specific product by SKU
- `get_product_stock`: Get stock information for a product by SKU
- `get_product_attributes`: Get all attributes for a product by SKU
- `get_product_by_id`: Get detailed information about a product by its ID
- `advanced_product_search`: Search for products with advanced filtering options
- `update_product_attribute`: Update a specific attribute of a product by SKU

### Customer Tools
- `get_customer_ordered_products_by_email`: Get all ordered products for a customer by email address
- `get_customers`, `get_customer`, `get_customer_groups`: Search/read customer profiles and groups
- `get_customer_analytics`: Top buyers, new/returning buyers, lifetime spend within scope and inactivity
- `get_abandoned_carts`, `get_cart`: Cart contents, totals and inactivity-based abandoned cart reports

### Inventory, Marketing and Content Tools
- `get_inventory`, `get_low_stock_products`, `get_inventory_risk`: Availability and sales-based stock estimates
- `get_sales_rules`, `get_coupons`, `get_coupon_performance`: Promotion configuration, usage and associated order metrics
- `get_product_prices`, `get_product_tier_prices`: Customer-group catalog prices and quantity tiers
- `search_cms_pages`, `get_cms_page`, `update_cms_page`, `get_cms_blocks`: CMS content and page updates
- `get_search_terms`, `get_product_reviews`: Storefront search terms and reviews

See [parameters, examples and required permissions](docs/merchant-tools.md) for all of these tools.

### Order and Revenue Tools
- `get_order_count`: Get the number of orders for a given date range
- `get_revenue`: Get revenue, order count and average order value, optionally grouped by month
- `get_revenue_by_country`: Get the same revenue metrics filtered by country, optionally grouped by month
- `get_orders`: List matching orders with order lines, using pagination
- `get_order`: Get one order with order lines by internal `order_id` or displayed `increment_id`
- `get_product_sales`: Get all sold products with quantities, revenue and distinct order counts, using pagination
- `get_category_sales`: Get complete category sales and category contribution per order, optionally grouped by month
- `get_credit_memos`, `get_refund_report`: Financial refunds and product refund amounts
- `get_order_tracking`, `get_invoices`: Shipments, tracking numbers and invoice details

### Sales analysis parameters

`get_revenue`, `get_revenue_by_country`, `get_orders`, `get_product_sales` and `get_category_sales` accept:

| Parameter | Meaning |
| --- | --- |
| `date_range` | Required. Relative expression or inclusive `YYYY-MM-DD to YYYY-MM-DD` range. `last N months` / `past N months` means the previous N **complete calendar months** (1–1200). |
| `status` | Exact order status. Omitted means all statuses, including canceled orders. |
| `country` | Billing **or** shipping country code/name. Required only for `get_revenue_by_country`. |
| `store_id` | Optional Magento store ID. |
| `currency` | Optional order currency such as `EUR`. Monetary summaries reject mixed currencies; no currency conversion is performed. |

Additional parameters:

| Tool | Parameters |
| --- | --- |
| Revenue tools | `group_by`: `none` (default) or `month`; `include_tax`: defaults to `true`; `subtract_refunds`: defaults to `false`; `refund_date_basis`: `refund_date` (default) or `order_date`. See [refund definitions](docs/merchant-tools.md#refunds-and-net-revenue). |
| `get_orders` | `page_size`, `current_page`, `include_items` (default `true`). |
| `get_order` | Exactly one of `order_id` (positive integer) or `increment_id` (string, preserving leading zeros); `include_documents` (default `true`) includes invoices, shipments and credit memos and requires their read permissions. |
| `get_categories` | `page_size`, `current_page`. |
| `get_product_sales` | `sku` (exact ordered SKU), `category_id`, `include_subcategories` (default `true`), `include_tax` (default `false`), `sort_by` (`quantity`, `revenue` or `sku`), `sort_direction` (`desc` or `asc`), `page_size`, `current_page`. Default sort: quantity descending. |
| `get_category_sales` | `sku`, `category_id`, `include_subcategories` (default `true`), `include_tax` (default `false`), `category_level` (default `2`, main categories below the store root), `group_by` (`none` or `month`), `page_size`, `current_page`. Categories are sorted by revenue descending. |

Pagination defaults to `page_size: 100`, `current_page: 1`, with a maximum page size of 500. Responses contain `total_count`, `total_pages`, `has_more` and `next_page`. Keep the filters and sorting unchanged and follow `next_page` until it is `null`. Product and category summaries always cover **all** matching sales, regardless of the returned page. For monthly category reports, each month contains the same category page as the overall report.

### Example tool calls

Monthly revenue and AOV for the previous 18 complete months (in September 2026, March 2025 through August 2026):

```json
{
  "name": "get_revenue",
  "arguments": { "date_range": "last 18 months", "group_by": "month", "include_tax": true }
}
```

Break down the same period by main product category, including tax:

```json
{
  "name": "get_category_sales",
  "arguments": {
    "date_range": "2025-03-01 to 2026-08-31",
    "group_by": "month",
    "category_level": 2,
    "include_tax": true
  }
}
```

`result.categories` contains `category_id`, `name`, `revenue`, allocated `quantity`, distinct `order_count` and `average_order_value`. `result.periods` contains these metrics for each month, including zero-sales months. `get_revenue` also returns `result.periods`, with `revenue`, `order_count`, `average_order_value`, `tax_amount` and `currency` per month. AOV is calculated from totals, not by averaging monthly averages.

Retrieve more than the top ten products or inspect the underlying orders:

```json
{ "name": "get_product_sales", "arguments": { "date_range": "last month", "page_size": 100, "current_page": 1, "sort_by": "revenue" } }
```

```json
{ "name": "get_orders", "arguments": { "date_range": "last month", "page_size": 50 } }
```

```json
{ "name": "get_order", "arguments": { "increment_id": "000000123" } }
```

### Calculation definitions

- Sales reports use order creation dates and ordered amounts/quantities. By default, refunds and canceled quantities are not subtracted. Revenue tools can deduct credit memos with `subtract_refunds: true`; product/category sales remain ordered amounts. Use `status` to select the order population. Order detail tools expose invoiced, shipped, canceled and refunded quantities where available.
- Order revenue/AOV uses `grand_total`, including shipping and discounts. `include_tax: false` subtracts `tax_amount`. Currency comes from `order_currency_code`; empty results have `currency: null`.
- Product/category revenue uses `row_total - discount_amount + discount_tax_compensation_amount`, plus `tax_amount` when requested. Shipping and order-level adjustments are not allocated to products. Quantities can be fractional. Free products are retained.
- Configurable and fixed-price bundle parent rows are counted once. Dynamic-price bundles with value on their child rows use those child rows and the bundle parent's categories. Raw order details retain both parent and child rows with `parent_item_id` for inspection.
- Category membership comes from the **current** catalog, not a historical snapshot. Products deleted from the catalog, without categories, or without an ancestor at the requested level appear as `Uncategorized` (`category_id: null`). Products are looked up in batches by product ID, so configurable category lookup does not depend on a variant SKU matching the parent SKU.
- Revenue and quantities of products in multiple categories at the requested level are split equally across those categories. For example, a €100 line in two main categories contributes €50 to each. Multiple subcategories under the same main category count only once at level 2. Rounding can cause small differences when adding displayed rows. Category order counts can overlap and should not be summed.
- Category `average_order_value` means **allocated category revenue / distinct orders containing that category**. It measures that category's contribution per order, not the entire basket value. `category_id` filters sold lines by current membership; those lines are then distributed across all their categories at `category_level`.
- `get_product_sales.result.products` is the requested page. `top_products` remains a ten-product summary for existing clients. `product_revenue` is the sum of matching item revenue; legacy `total_revenue` is the full grand total of orders containing those items (including their other products, tax and shipping). `average_revenue_per_product` now uses item revenue and counted quantities; product revenue now includes discounts and parent/child quantities are no longer doubled.

Relative date expressions use the server's calendar. Date filters and monthly grouping use Magento `created_at` timestamps without a store-timezone conversion; run with `TZ=UTC` for UTC calendar boundaries.

The sales tools use standard Magento `/orders`, `/orders/{id}`, `/products` and `/categories/list` endpoints; refunds and order documents use `/creditmemos`, `/invoices` and `/shipments`. The integration token needs read access to the requested data. No Magento extension is needed for these sales tools. Each aggregate request reads all matching order pages; category reports additionally fetch the relevant products in batches and the category list. Large periods can therefore take longer than one MCP request timeout; configure your client's timeout accordingly. Repeated or incomplete API pages produce an error instead of partial totals.

After updating the server, restart the MCP connection and refresh the client's tool list so the new tools and parameters become available.

## Example Queries for Claude

Once the MCP server is connected to Claude Desktop, you can ask questions like:

### Product Queries
- "What products do you have that are shirts?"
- "Tell me about product with SKU SKU-xxx"
- "What categories does product SKU-xxx belong to?"
- "Are there any related products to SKU-SKU-xxx?"
- "What's the stock status of product SKU-xxx?"
- "Show me all products sorted by price"
- "Update the price of product SKU-xxx to $49.99"
- "Change the description of product ABC-123 to describe it as water-resistant"
- "Set the status of product XYZ-456 to 'enabled'"

### Customer Queries
- "What products has customer john.doe@example.com ordered?"
- "Show me the order history and products for customer with email jane.smith@example.com"

### Order and Revenue Queries
- "How many orders do we have today?"
- "What's our order count for last week?"
- "How much revenue did we generate yesterday?"
- "What was our total revenue last month?"
- "How much revenue did we make in The Netherlands this year to date?"
- "What's our revenue in Germany for the last week?"
- "Compare our revenue between the US and Canada for this month"
- "What's our average order value for completed orders this month?"
- "How many products did we sell last month?"
- "What are our top-selling products this year?"
- "What's the average number of products per order?"
- "How many units of product XYZ-123 did we sell in Germany last quarter?"
- "Which products generated the most revenue in the US this month?"


## Development

### Automated tests

```bash
npm ci
npm test
```

Tests connect a real MCP client over stdio to the server and use a local mock Magento HTTP API. No store credentials or live orders are needed. They cover pagination beyond 100 products, monthly AOV and empty months, filters, currency handling, discounts/tax, configurable and bundle products, category allocation and API failures. `test-mcp-server.js` remains an optional smoke test against a configured Magento instance.

Merchant tests also cover cart inactivity, refund date bases, customer histories, stock reservations, coupon metrics, contextual pricing, module errors and CMS updates preserving existing settings. Run `npm run test:php` for standalone companion-module tests (PHP 8.1+ with SimpleXML); see its [installation guide](magento-module/README.md) for deployment validation.

### SSL Certificate Verification

For development purposes, the server is configured to bypass SSL certificate verification. In a production environment, you should use proper SSL certificates and remove the `httpsAgent` configuration from the `callMagentoApi` function.

### Adding New Tools

To add new tools, follow the pattern in the existing code. Each tool is defined with:

1. A unique name
2. A description
3. Input parameters with validation using Zod
4. An async handler function that processes the request and returns a response

## License

ISC
