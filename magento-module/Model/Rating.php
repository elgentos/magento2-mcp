<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

use Elgentos\McpMerchant\Api\Data\RatingInterface;

class Rating implements RatingInterface
{
    public function __construct(private array $data)
    {
    }

    public function getRatingId(): int
    {
        return (int) $this->data['rating_id'];
    }

    public function getValue(): int
    {
        return (int) $this->data['value'];
    }

    public function getPercent(): int
    {
        return (int) $this->data['percent'];
    }
}
