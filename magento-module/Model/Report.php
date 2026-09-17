<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

use Elgentos\McpMerchant\Api\Data\SearchTermsReportInterface;
use Elgentos\McpMerchant\Api\Data\ProductReviewsReportInterface;
use Elgentos\McpMerchant\Api\Data\ProductPricesReportInterface;

class Report implements SearchTermsReportInterface, ProductReviewsReportInterface, ProductPricesReportInterface
{
    public function __construct(private array $items = [], private int $totalCount = 0)
    {
    }

    public function getItems(): array
    {
        return $this->items;
    }

    public function getTotalCount(): int
    {
        return $this->totalCount;
    }
}
