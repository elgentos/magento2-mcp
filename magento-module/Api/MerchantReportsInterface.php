<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Api;

use Elgentos\McpMerchant\Api\Data\SearchTermsReportInterface;
use Elgentos\McpMerchant\Api\Data\ProductReviewsReportInterface;
use Elgentos\McpMerchant\Api\Data\ProductPricesReportInterface;

interface MerchantReportsInterface
{
    /**
     * @param int $storeId
     * @param int $pageSize
     * @param int $currentPage
     * @param string $query
     * @param bool $zeroResultsOnly
     * @param int $minPopularity
     * @return \Elgentos\McpMerchant\Api\Data\SearchTermsReportInterface
     */
    public function getSearchTerms(int $storeId = 0, int $pageSize = 100, int $currentPage = 1,
        string $query = '', bool $zeroResultsOnly = false, int $minPopularity = 0): SearchTermsReportInterface;

    /**
     * @param string $sku
     * @param int $storeId
     * @param string $status
     * @param int $pageSize
     * @param int $currentPage
     * @return \Elgentos\McpMerchant\Api\Data\ProductReviewsReportInterface
     */
    public function getProductReviews(string $sku, int $storeId = 0, string $status = 'all',
        int $pageSize = 100, int $currentPage = 1): ProductReviewsReportInterface;

    /**
     * @param string[] $skus
     * @param int $storeId
     * @param int $customerGroupId
     * @param float $quantity
     * @return \Elgentos\McpMerchant\Api\Data\ProductPricesReportInterface
     */
    public function getProductPrices(array $skus, int $storeId, int $customerGroupId = 0, float $quantity = 1): ProductPricesReportInterface;
}
