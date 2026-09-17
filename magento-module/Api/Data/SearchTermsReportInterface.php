<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface SearchTermsReportInterface extends ReportInterface
{
    /** @return \Elgentos\McpMerchant\Api\Data\SearchTermInterface[] */
    public function getItems(): array;
}
