<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface ReportInterface
{
    /** @return int */
    public function getTotalCount(): int;
}
