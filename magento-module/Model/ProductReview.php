<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

use Elgentos\McpMerchant\Api\Data\ProductReviewInterface;

class ProductReview implements ProductReviewInterface
{
    public function __construct(private array $data)
    {
    }

    public function getId(): int
    {
        return (int) $this->data['id'];
    }

    public function getSku(): string
    {
        return (string) $this->data['sku'];
    }

    public function getProductId(): int
    {
        return (int) $this->data['product_id'];
    }

    public function getStatus(): string
    {
        return (string) $this->data['status'];
    }

    public function getTitle(): string
    {
        return (string) $this->data['title'];
    }

    public function getDetail(): string
    {
        return (string) $this->data['detail'];
    }

    public function getNickname(): string
    {
        return (string) $this->data['nickname'];
    }

    public function getCreatedAt(): string
    {
        return (string) $this->data['created_at'];
    }

    public function getRatings(): array
    {
        return $this->data['ratings'] ?? [];
    }
}
