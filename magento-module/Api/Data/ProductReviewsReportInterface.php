<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface ProductReviewsReportInterface extends ReportInterface
{
    /** @return \Elgentos\McpMerchant\Api\Data\ProductReviewInterface[] */
    public function getItems(): array;
}
