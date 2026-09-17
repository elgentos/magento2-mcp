<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

use Elgentos\McpMerchant\Api\Data\SearchTermInterface;

class SearchTerm implements SearchTermInterface
{
    public function __construct(private array $data)
    {
    }

    public function getId(): int
    {
        return (int) $this->data['id'];
    }

    public function getQuery(): string
    {
        return (string) $this->data['query'];
    }

    public function getStoreId(): int
    {
        return (int) $this->data['store_id'];
    }

    public function getPopularity(): int
    {
        return (int) $this->data['popularity'];
    }

    public function getNumResults(): int
    {
        return (int) $this->data['num_results'];
    }

    public function getUpdatedAt(): ?string
    {
        return isset($this->data['updated_at']) ? (string) $this->data['updated_at'] : null;
    }
}
