# Company tools: Elgentos B2B suite

These nine tools read and maintain the company entities of the Elgentos B2B suite. The suite adds a company layer on top of Magento: a company holds business identification and address data, Magento customers belong to a company with a role, and products can carry a price per company and quantity. The API reference is the [B2B suite API documentation](https://elgentos-b2b-suite-api-docs.vercel.app/).

**Not every Magento instance has this module.** The tools call the `/V1/company*` routes of the `Elgentos_CompanyAccounts` module. On an instance without the module, these routes do not exist. The tools detect this and return an installation message instead of a raw HTTP 404. See [Optional module detection](#optional-module-detection).

## Setup and shared conventions

The existing `MAGENTO_BASE_URL` and `MAGENTO_API_TOKEN` configuration is reused. Restart the MCP server and refresh your client's tool list after updating.

Paginated tools accept `page_size` (default 100, maximum 500) and `current_page` (default 1). Results include `total_count`, `total_pages`, `has_more` and `next_page`. Follow `next_page` without changing filters.

Magento stores domain based auto-assignment as the JSON string `auto_assign_config`. Every tool that returns a company adds the parsed value as `auto_assign` and keeps the raw string. Write tools accept `auto_assign` as an object and encode it. If the stored string is not valid JSON, `auto_assign` reports `parse_error` with the raw value instead of failing the call.

Company status is one of `pending`, `active`, `inactive`, `declined` and `cancelled`. Magento sets new companies to `pending` unless a status is given.

## Reading companies

| Tool | Parameters | Result |
| --- | --- | --- |
| `get_company_support` | None | Whether the B2B company module is present and readable with this token, with the reason when it is not: `module_missing`, `token_rejected` or `unexpected_response`. |
| `get_companies` | Optional partial `name`, `status`, `coc_number`, `vat_number`, `email`, `city`, `country`, pagination | Matching companies with address, contact data and parsed `auto_assign`. |
| `get_company` | Exactly one of `company_id` or `customer_id` | One company, or the company a customer belongs to. |
| `get_company_customer` | Required `customer_id` | The company assignment of a customer, including `role_id`. |

`name` is a partial match; the other filters are exact. `country` accepts a code or a name, so `NL` and `The Netherlands` select the same companies.

A customer without a company is a normal answer, not an error: `get_company` returns `company: null` and `get_company_customer` returns `assignment: null`, both with an explanatory note. An unknown `company_id` is an error.

`get_customer` already returns the `company` and `company_role` extension attributes on the standard customer record, so no separate customer tool is needed for company data.

```json
{"name":"get_companies","arguments":{"status":"pending","country":"NL","page_size":50}}
```

## Writing companies

| Tool | Parameters | Result |
| --- | --- | --- |
| `create_company` | Required `name`, `coc_number`, `vat_number`, `street`, `postcode`, `city`, `country_id`, `email`; optional `status`, `telephone`, `representative`, `auto_assign` | The created company including its new `company_id`. |
| `update_company` | Required `company_id` and `changes` with at least one company field | The updated company, the `changed_fields` and the `previous` record. |
| `delete_company` | Required `company_id` and `confirm: true` | Confirmation and the `deleted_company` snapshot. |
| `assign_customer_to_company` | Required `company_id` and `customer_id`; optional `role_id` | The assignment, the company and any `previous_assignment`. |

`update_company` reads the company first and sends the merged record, so a field that is left out keeps its current value. The `company_id` is never part of the payload body.

`delete_company` is permanent and unassigns the customers of the company, so it needs `confirm: true`. The tool reads the company before deleting it and returns the record, which lets you recreate the company with `create_company`. A recreated company gets a new `company_id`.

A customer belongs to one company at a time. `assign_customer_to_company` verifies the company, reads the current assignment first, and adds a warning when the call moves a customer from one company to another.

```json
{"name":"update_company","arguments":{"company_id":12,"changes":{"status":"active","auto_assign":{"enabled":true,"domains":["acme.com"]}}}}
```

## Company prices

| Tool | Parameters | Result |
| --- | --- | --- |
| `set_company_prices` | Required `sku`, `prices` (list of `company_id`, `quantity`, `price`) and `confirm: true` | The stored tiers and the replaced tier count. |

This tool replaces **all** company price tiers of one SKU. Tiers that are left out are removed, and an empty `prices` list removes every company price for the SKU. The B2B API has no read route for current company prices, so you cannot read the tiers back before you replace them: send the complete intended set. The tool needs `confirm: true` and verifies the SKU before writing.

Magento applies the tier with the highest `quantity` that the ordered quantity reaches. Company prices are separate from the standard Magento tier prices that `get_product_tier_prices` reads.

```json
{"name":"set_company_prices","arguments":{"sku":"SKU-A","prices":[{"company_id":1,"quantity":1,"price":10},{"company_id":1,"quantity":10,"price":8}],"confirm":true}}
```

## Optional module detection

On the first company call, the server requests `/V1/company/search` with one record and caches the answer for the process:

- **HTTP 404**: the module is not installed. Every company tool then reports this and makes no further calls, so an unsupported instance costs one request.
- **HTTP 401 or 403**: Magento rejected the token. The token can be expired, or the integration can lack the company permission.
- **A valid search response**: the tools proceed.

A transient failure, for example a network error or an HTTP 500, is not cached; the next call probes again. Because the probe runs first, a later 404 means a missing record and the tools report it as such, for example `Company 99 not found`.

## Required Magento access

Grant the integration these resources of the B2B suite:

- `Elgentos_CompanyAccounts::companies_view` for `get_company_support`, `get_companies`, `get_company` and `get_company_customer`.
- `Elgentos_CompanyAccounts::companies_edit` for `create_company`, `update_company` and `assign_customer_to_company`.
- `Elgentos_CompanyAccounts::companies_delete` for `delete_company`.
- `Magento_Catalog::products` for `set_company_prices`, which also reads the product to verify the SKU.

## Verification

Run `npm test` for real MCP stdio client tests against a local mock of the B2B API. The company tests cover the filters, the JSON auto-assignment encoding and decoding, partial updates, the confirmation guards on the two destructive tools, and three server instances: with the module, without the module and with a rejected token. These tests require no live store. They do not replace testing the tools against your Magento version, your data and your installed B2B suite release.
