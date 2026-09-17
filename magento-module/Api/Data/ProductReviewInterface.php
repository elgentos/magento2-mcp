<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface ProductReviewInterface
{
    /** @return int */
    public function getId(): int;

    /** @return string */
    public function getSku(): string;

    /** @return int */
    public function getProductId(): int;

    /** @return string */
    public function getStatus(): string;

    /** @return string */
    public function getTitle(): string;

    /** @return string */
    public function getDetail(): string;

    /** @return string */
    public function getNickname(): string;

    /** @return string */
    public function getCreatedAt(): string;

    /** @return \Elgentos\McpMerchant\Api\Data\RatingInterface[] */
    public function getRatings(): array;
}
