<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface SearchTermInterface
{
    /** @return int */
    public function getId(): int;

    /** @return string */
    public function getQuery(): string;

    /** @return int */
    public function getStoreId(): int;

    /** @return int */
    public function getPopularity(): int;

    /** @return int */
    public function getNumResults(): int;

    /** @return string|null */
    public function getUpdatedAt(): ?string;
}
