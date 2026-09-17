<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api\Data;

interface RatingInterface
{
    /** @return int */
    public function getRatingId(): int;

    /** @return int */
    public function getValue(): int;

    /** @return int */
    public function getPercent(): int;
}
