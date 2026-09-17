<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface ProductPriceInterface
{
    /** @return string */
    public function getSku(): string;

    /** @return bool */
    public function getFound(): bool;

    /** @return string|null */
    public function getReason(): ?string;

    /** @return string|null */
    public function getName(): ?string;

    /** @return int|null */
    public function getStoreId(): ?int;

    /** @return int|null */
    public function getWebsiteId(): ?int;

    /** @return int|null */
    public function getCustomerGroupId(): ?int;

    /** @return float|null */
    public function getQuantity(): ?float;

    /** @return string|null */
    public function getCurrency(): ?string;

    /** @return bool|null */
    public function getCatalogPricesIncludeTax(): ?bool;

    /** @return float|null */
    public function getRegularPrice(): ?float;

    /** @return float|null */
    public function getIndexedFinalPrice(): ?float;

    /** @return float|null */
    public function getMinimumPrice(): ?float;

    /** @return float|null */
    public function getMaximumPrice(): ?float;

    /** @return float|null */
    public function getUnitPrice(): ?float;

    /** @return bool|null */
    public function getIndexAvailable(): ?bool;

    /** @return string|null */
    public function getPriceNote(): ?string;
}
