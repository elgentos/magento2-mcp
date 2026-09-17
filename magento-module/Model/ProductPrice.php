<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

use Elgentos\McpMerchant\Api\Data\ProductPriceInterface;

class ProductPrice implements ProductPriceInterface
{
    public function __construct(private array $data)
    {
    }

    public function getSku(): string
    {
        return (string) $this->data['sku'];
    }

    public function getFound(): bool
    {
        return (bool) $this->data['found'];
    }

    public function getReason(): ?string
    {
        return isset($this->data['reason']) ? (string) $this->data['reason'] : null;
    }

    public function getName(): ?string
    {
        return isset($this->data['name']) ? (string) $this->data['name'] : null;
    }

    public function getStoreId(): ?int
    {
        return isset($this->data['store_id']) ? (int) $this->data['store_id'] : null;
    }

    public function getWebsiteId(): ?int
    {
        return isset($this->data['website_id']) ? (int) $this->data['website_id'] : null;
    }

    public function getCustomerGroupId(): ?int
    {
        return isset($this->data['customer_group_id']) ? (int) $this->data['customer_group_id'] : null;
    }

    public function getQuantity(): ?float
    {
        return isset($this->data['quantity']) ? (float) $this->data['quantity'] : null;
    }

    public function getCurrency(): ?string
    {
        return isset($this->data['currency']) ? (string) $this->data['currency'] : null;
    }

    public function getCatalogPricesIncludeTax(): ?bool
    {
        return isset($this->data['catalog_prices_include_tax']) ? (bool) $this->data['catalog_prices_include_tax'] : null;
    }

    public function getRegularPrice(): ?float
    {
        return isset($this->data['regular_price']) ? (float) $this->data['regular_price'] : null;
    }

    public function getIndexedFinalPrice(): ?float
    {
        return isset($this->data['indexed_final_price']) ? (float) $this->data['indexed_final_price'] : null;
    }

    public function getMinimumPrice(): ?float
    {
        return isset($this->data['minimum_price']) ? (float) $this->data['minimum_price'] : null;
    }

    public function getMaximumPrice(): ?float
    {
        return isset($this->data['maximum_price']) ? (float) $this->data['maximum_price'] : null;
    }

    public function getUnitPrice(): ?float
    {
        return isset($this->data['unit_price']) ? (float) $this->data['unit_price'] : null;
    }

    public function getIndexAvailable(): ?bool
    {
        return isset($this->data['index_available']) ? (bool) $this->data['index_available'] : null;
    }

    public function getPriceNote(): ?string
    {
        return isset($this->data['price_note']) ? (string) $this->data['price_note'] : null;
    }
}
