# Merchant tools: priorities 1 and 2

These 24 tools extend the existing sales tools. `get_revenue`, `get_revenue_by_country` and `get_order` also gain functionality. The [merchant comparison](mcp-merchant-comparison.nl.md) records the original selection.

All new tools read data except `update_cms_page`, which saves the requested content/SEO changes. Configured tier prices use a **read-only POST** in Magento's standard API. No tool creates refunds, sends recovery emails or changes inventory.

## Setup and shared conventions

The existing `MAGENTO_BASE_URL` and `MAGENTO_API_TOKEN` configuration is reused. Restart the MCP server and refresh your client's tool list after updating. Three tools require the bundled [Elgentos_McpMerchant module](../magento-module/README.md): `get_product_prices`, `get_search_terms` and `get_product_reviews`. The other tools use standard Magento REST APIs. MSI tools require Magento Inventory/MSI; set `inventory_mode: "legacy"` explicitly for an installation without MSI.

Paginated tools accept `page_size` (default 100, maximum 500) and `current_page` (default 1). Results include `total_count`, `total_pages`, `has_more` and `next_page`. Follow `next_page` without changing filters. Aggregations cover all matching records before returning the selected page. Missing/failed API pages produce errors, not partial totals.

`date_range` accepts relative dates and inclusive `YYYY-MM-DD to YYYY-MM-DD`. `last N months` means the previous complete calendar months; `last N days` means the previous complete days, excluding today. Run the MCP server with `TZ=UTC` to align calendar boundaries with Magento timestamps. No automatic store-timezone conversion is applied.

Where listed below, **order filters** mean `date_range` (required), `status`, `store_id`, `country` (billing OR shipping) and `currency`. Monetary summaries reject mixed currencies and never convert them. Existing sales/revenue tools include all order statuses by default. Customer analytics, coupon performance and inventory risk exclude canceled orders unless an explicit `status` is given.

Reports are current snapshots of recorded Magento data. Reading a previous period does not reconstruct historical product assignments, stock levels, customer account changes or historical promotion/index configurations. Large cart, customer or inventory reports can require many API calls; allow an appropriate MCP request timeout and restrict the scope when useful.

## Priority 1

### Shopping carts

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_abandoned_carts` | Optional `date_range` for last update, `inactive_hours` (24), `as_of` (ISO timestamp, defaults to now), `min_total`, `currency`, `store_id`, pagination | Active, nonempty carts last updated before the inactivity cutoff; items, contact details where available, calculated totals and totals separated by currency. |
| `get_cart` | Required internal `cart_id` | One cart's items and customer context; totals for active carts. Inactive/converted carts return `totals: null` with an explanation because Magento's totals endpoint only accepts active carts. |

Totals come from `/carts/{id}/totals`, not an assumed total on cart search records. They describe current stored/calculated cart values, not guaranteed recoverable revenue. Anonymous carts may have no email or name. `as_of` controls the inactivity cutoff; it does not restore a historical cart snapshot.

```json
{"name":"get_abandoned_carts","arguments":{"inactive_hours":48,"min_total":250,"currency":"EUR","store_id":1}}
```

### Refunds and net revenue

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_credit_memos` | Optional `date_range` for issue date, `order_id`, `state`, pagination | Credit memos including refund lines; states: 1 open, 2 refunded, 3 canceled. |
| `get_refund_report` | Order filters; `date_basis` (`refund_date` default or `order_date`); `include_tax` (true); `group_by` (`none` or `month`); pagination | Refunded credit memo count, distinct orders, refund amount, products with refunded quantities/amounts and monthly totals. Only state 2 is counted. |
| `get_revenue`, `get_revenue_by_country` | Existing parameters plus `subtract_refunds` (false) and `refund_date_basis` (`refund_date` default or `order_date`) | Optional net revenue alongside gross revenue and refunds. |

Two date bases answer different questions:

- `refund_date`: credit memos issued in the selected period, even if their orders were placed earlier. Original order status, store, country and currency filters still apply.
- `order_date`: all recorded refunds against orders created in the selected period, including refunds issued after that period. This is the current outcome of that order cohort, not its historic balance at period end.

With `subtract_refunds: true`, `gross_revenue` is the original order amount, `refund_amount` is the selected refund total, and both `revenue` and `net_revenue` contain their difference. `average_order_value` continues to measure gross basket value. `net_average_order_value` is only calculated for an `order_date` cohort with orders; it is `null` for refund-date reports because refunds can belong to unrelated, older baskets. `tax_amount` remains the original order tax total. `include_tax: false` subtracts each document's tax from its amount.

Product refund amounts use matched credit memo rows after discounts, with optional tax. Parent/child rows are counted once. `unallocated_refund_amount` includes shipping, adjustments and unmatched lines. A financial refund does not prove goods were physically returned or restocked.

```json
{"name":"get_revenue","arguments":{"date_range":"last 18 months","group_by":"month","subtract_refunds":true,"refund_date_basis":"order_date","currency":"EUR"}}
```

### Customers

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_customers` | Optional exact `email`, partial full `name`, `group_id`, `website_id`, registration `date_range`, pagination | Registered customer profiles, addresses and custom attributes. |
| `get_customer` | Exactly one of `customer_id` or `email`; optional `website_id` for email lookup | One profile. Ambiguous emails across websites require a website or ID. |
| `get_customer_groups` | Pagination | Customer group IDs, names and tax class information. |
| `get_customer_analytics` | Order filters; `segment` (`all`, `new`, `returning`, `inactive`); `inactive_days` (90); pagination | Buyer counts, new/returning customers, revenue, AOV, first/last orders, lifetime spend within scope and days since last order. |

Customer analytics reads earlier order history through the period end (capped at now). A new buyer has their first recorded, matching noncanceled order during the selected period. Registered accounts use customer IDs. Guests use normalized email within website, remain separate from registered accounts, and guests without email remain separate per order. This avoids treating every guest as the same customer or claiming all buyers in a selected month are new.

`segment: "all"` lists buyers active in the period, sorted by revenue. `inactive` can include people who bought only before the selected period. Summary figures describe all buyers in scope before pagination and segment selection. Lifetime means all recorded orders **within the same filters** through the reference date; revenue includes tax/shipping and precedes refunds. Customers who never ordered are available in `get_customers`, not buyer analytics. Inactivity is not proof of churn.

```json
{"name":"get_customer_analytics","arguments":{"date_range":"last month","currency":"EUR","segment":"inactive","inactive_days":90}}
```

### Inventory

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_inventory` | Required `skus` (1–100); `stock_id` (1), `inventory_mode` (`msi` default or `legacy`), `include_sources` (true) | Salable quantity, salability and physical source quantities restricted to the selected stock's sources. |
| `get_low_stock_products` | Optional `skus`; same inventory parameters; `threshold` (5), `include_disabled` (false), pagination | All matching catalog products at/below the quantity threshold, sorted by availability. |
| `get_inventory_risk` | Optional `skus`; same inventory parameters; `date_range` (`last 30 days`), `store_id`, `status`, `risk_days` (14), `risk` (`all`, `out_of_stock`, `at_risk`, `no_sales`, `healthy`), `include_disabled` (false), pagination | Current availability, net ordered units, average daily units, estimated stock duration and risk counts. |

MSI salable quantities include Magento's reservation calculations. Physical source quantities are reported separately. Legacy mode supports stock 1 and reports physical quantity with `salable_quantity: null`; it does not claim to account for MSI reservations or inherited configuration. Composite products and unknown SKUs are reported explicitly as unavailable for this calculation rather than being assigned zero stock.

Risk uses `(ordered units - canceled units - refunded units) / days in the period`, with current cancellation/refund quantities, and divides current availability by that daily demand. Select a `store_id` matching the website served by `stock_id`. Estimates do not account for purchase orders, replenishment lead times, historic stockouts or changing demand. `no_sales` means no net sales in this window, not proven obsolete stock. The low-stock threshold is explicit; it does not infer inherited notification settings.

```json
{"name":"get_inventory_risk","arguments":{"stock_id":1,"store_id":1,"date_range":"last 90 days","risk_days":21,"risk":"at_risk"}}
```

### Customer service and fulfillment

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_order_tracking` | Internal `order_id` | Shipments, shipment items, carriers and tracking numbers. |
| `get_invoices` | Optional issue `date_range`, `order_id`, `state`, pagination | Invoices with amounts and lines; states: 1 open, 2 paid, 3 canceled. |
| `get_order` (extended) | Existing `order_id` or `increment_id`; `include_documents` (true) | Customer details, billing/shipping, payment method/amounts, status history, invoices, shipments and credit memos. |

Tracking data comes from Magento, not a live carrier tracking service. Payment output uses an explicit field list, excluding arbitrary `additional_information`. Document permission/API failures remain errors; use `include_documents: false` when only the order itself is needed.

## Priority 2

### Promotions

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_sales_rules` | Optional `rule_id`, partial `name`, `is_active`, `website_id`, `customer_group_id`, pagination | Cart price rules including conditions, actions, schedules, website and customer group scope. With `rule_id`, website/group filters still apply; name/active filters are search-only. |
| `get_coupons` | Optional `rule_id`, exact `code`, creation `date_range`, pagination | Configured coupon codes with usage, expiry and limits. |
| `get_coupon_performance` | Order filters; optional `coupon_code`; pagination | Orders, gross revenue, AOV, discounts and buyer counts per code; comparison of orders with/without coupons. |

Performance reads historical order coupon codes, including deleted codes. Revenue includes tax/shipping before refunds. Discounts are the total discounts on those orders and may include other promotions. The with/without comparison covers all selected orders even when `coupon_code` restricts the coupon table. These figures describe associations, not incremental revenue caused by an action. Coupon buyer counts use customer ID, otherwise email within store (or order ID if absent).

### Prices

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_product_prices` | `skus` (1–100), required `store_id`; `customer_group_id` (0), `quantity` (1) | Current indexed catalog prices for the store's website/customer group, eligible staffel/tier prices, unit price and catalog range. Requires the module. |
| `get_product_tier_prices` | `skus` (1–100); optional `website_id`, `customer_group` (name) | Configured quantity thresholds, website/customer group and fixed/percentage price rules. Global website and ALL GROUPS rules are retained when filtering. |

Product prices are in website base currency with the store's `catalog_prices_include_tax` setting. They are a current index snapshot, including indexed catalog rules and eligible tiers; they do not quote shipping, cart promotions, custom options or address-specific checkout tax, nor simulate a future/past pricing date. Index freshness matters. Composite products return a catalog range and `unit_price: null`; request the variant/component SKU for a unit price. Missing website/index entries are reported explicitly. Prices are not converted to the shopper's display currency.

```json
{"name":"get_product_prices","arguments":{"skus":["PANEL-470"],"store_id":1,"customer_group_id":2,"quantity":20}}
```

### CMS

| Tool | Parameters | Result |
| --- | --- | --- |
| `search_cms_pages` | Optional partial `title`, exact `identifier`, `is_active`, pagination | CMS page content and metadata. |
| `get_cms_page` | Exactly one of `page_id` or `identifier` | A full page; ambiguous identifiers across stores require an ID. |
| `get_cms_blocks` | Optional partial `title`, exact `identifier`, `is_active`, pagination | Content blocks. |
| `update_cms_page` | Required `page_id`, nonempty `changes`; optional `expected_update_time` | Saved page and list of changed fields. |

Allowed `changes`: `title`, `content`, `content_heading`, `meta_title`, `meta_keywords`, `meta_description`, `is_active`. The tool reads the page before saving and preserves the identifier, layout and other fields. Unknown fields are rejected. Provide the page's last-read `update_time` as `expected_update_time` to reject an already stale edit. This check does not provide an atomic lock against edits made between the read and save.

```json
{"name":"update_cms_page","arguments":{"page_id":5,"changes":{"meta_description":"Shipping information and delivery times."},"expected_update_time":"2026-09-01 12:00:00"}}
```

### Search and reviews

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_search_terms` | `store_id` (0 = all), optional partial `query`, `zero_results_only` (false), `min_popularity` (0), pagination | Stored storefront search terms, popularity and result counts; sorted by popularity. Requires the module. |
| `get_product_reviews` | Required `sku`; `store_id` (0 = all), `status` (`all`, `approved`, `pending`, `not_approved`), pagination | Reviews, text, author nickname, status and rating votes, newest first. Requires the module. |

Search popularity is Magento's stored cumulative count, not a dated traffic or conversion report. Result counts can reflect the most recent stored search state. Review output includes nonpublic statuses only through the integration's review permission. These tools read data; they do not moderate reviews.

## Required Magento access

Grant the integration access to the relevant standard resources: catalog products/prices, sales orders, invoices, shipments, credit memos, customer accounts/groups, stores, carts, cart price rules/coupons, CMS pages/blocks and MSI stock/source/salability APIs as used. Magento may group read and write routes under one existing ACL resource (for example carts and CMS); the tool's behavior is determined by the calls described above.

`get_order` now fetches related documents by default and therefore requires those document permissions. Customer analytics also uses `/store/storeViews` to identify the website of guest orders. MSI source access is only needed with `include_sources: true`.

The module provides separate permissions for search terms, reviews and contextual prices. A missing module produces an installation message; a forbidden or failed API request produces an error. See the [installation guide](../magento-module/README.md) for the exact module resources.

## Verification

Run `npm test` for real MCP stdio client tests against a local mock Magento API. Run `npm run test:php` for standalone PHP pricing, typed REST contract and ACL tests (PHP 8.1+ with SimpleXML). These tests require no live store and make no external changes. They do not replace installing/compiling the module and testing its endpoints against your Magento version, data and extensions.
