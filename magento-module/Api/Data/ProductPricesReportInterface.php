<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface ProductPricesReportInterface extends ReportInterface
{
    /** @return \Elgentos\McpMerchant\Api\Data\ProductPriceInterface[] */
    public function getItems(): array;
}
