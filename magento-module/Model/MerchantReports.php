<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

use Elgentos\McpMerchant\Api\MerchantReportsInterface;
use Elgentos\McpMerchant\Api\Data\SearchTermsReportInterface;
use Elgentos\McpMerchant\Api\Data\ProductReviewsReportInterface;
use Elgentos\McpMerchant\Api\Data\ProductPricesReportInterface;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Customer\Api\GroupRepositoryInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Exception\InputException;
use Magento\Review\Model\ResourceModel\Review\CollectionFactory as ReviewCollectionFactory;
use Magento\Review\Model\Rating\Option\VoteFactory;
use Magento\Search\Model\ResourceModel\Query\CollectionFactory as QueryCollectionFactory;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;

class MerchantReports implements MerchantReportsInterface
{
    public function __construct(
        private QueryCollectionFactory $queries,
        private ReviewCollectionFactory $reviews,
        private ProductCollectionFactory $products,
        private ProductRepositoryInterface $productRepository,
        private GroupRepositoryInterface $groups,
        private StoreManagerInterface $stores,
        private ScopeConfigInterface $config,
        private VoteFactory $votes,
        private PriceCalculator $priceCalculator
    ) {
    }

    private function validatePage(int $storeId, int $pageSize, int $currentPage): void
    {
        if ($storeId < 0 || $pageSize < 1 || $pageSize > 500 || $currentPage < 1) {
            throw new InputException(__('Invalid store or pagination parameters.'));
        }
        if ($storeId > 0) {
            $this->stores->getStore($storeId);
        }
    }

    public function getSearchTerms(int $storeId = 0, int $pageSize = 100, int $currentPage = 1,
        string $query = '', bool $zeroResultsOnly = false, int $minPopularity = 0): SearchTermsReportInterface
    {
        $this->validatePage($storeId, $pageSize, $currentPage);
        if ($minPopularity < 0) {
            throw new InputException(__('Popularity cannot be negative.'));
        }
        $collection = $this->queries->create();
        if ($storeId > 0) {
            $collection->addFieldToFilter('store_id', $storeId);
        }
        if ($query !== '') {
            $collection->addFieldToFilter('query_text', ['like' => '%' . $query . '%']);
        }
        if ($zeroResultsOnly) {
            $collection->addFieldToFilter('num_results', 0);
        }
        $collection->addFieldToFilter('popularity', ['gteq' => $minPopularity]);
        $collection->setOrder('popularity', 'DESC')->setOrder('query_id', 'ASC');
        $total = $collection->getSize();
        $collection->setPageSize($pageSize)->setCurPage($currentPage);
        $items = [];
        foreach ($collection as $queryModel) {
            $items[] = new SearchTerm([
                'id' => (int) $queryModel->getId(), 'query' => (string) $queryModel->getQueryText(),
                'store_id' => (int) $queryModel->getStoreId(), 'popularity' => (int) $queryModel->getPopularity(),
                'num_results' => (int) $queryModel->getNumResults(), 'updated_at' => $queryModel->getUpdatedAt()
            ]);
        }
        return new Report($items, $total);
    }

    public function getProductReviews(string $sku, int $storeId = 0, string $status = 'all',
        int $pageSize = 100, int $currentPage = 1): ProductReviewsReportInterface
    {
        $this->validatePage($storeId, $pageSize, $currentPage);
        $states = ['approved' => 1, 'pending' => 2, 'not_approved' => 3];
        if ($status !== 'all' && !isset($states[$status])) {
            throw new InputException(__('Invalid review status.'));
        }
        $product = $this->productRepository->get($sku, false, $storeId ?: null);
        $collection = $this->reviews->create()->addEntityFilter('product', (int) $product->getId());
        if ($storeId > 0) {
            $collection->addStoreFilter($storeId);
        }
        if ($status !== 'all') {
            $collection->addStatusFilter($states[$status]);
        }
        $total = $collection->getSize();
        $collection->setOrder('main_table.review_id', 'DESC')->setPageSize($pageSize)->setCurPage($currentPage);
        $items = [];
        foreach ($collection as $review) {
            $votes = $this->votes->create()->getResourceCollection()->setReviewFilter($review->getId());
            if ($storeId > 0) {
                $votes->setStoreFilter($storeId);
            }
            $ratings = [];
            foreach ($votes as $vote) {
                $ratings[] = new Rating(['rating_id' => (int) $vote->getRatingId(), 'value' => (int) $vote->getValue(), 'percent' => (int) $vote->getPercent()]);
            }
            $items[] = new ProductReview([
                'id' => (int) $review->getId(), 'sku' => $sku, 'product_id' => (int) $product->getId(),
                'status' => array_search((int) $review->getStatusId(), $states, true) ?: 'unknown',
                'title' => $review->getTitle(), 'detail' => $review->getDetail(), 'nickname' => $review->getNickname(),
                'created_at' => $review->getCreatedAt(), 'ratings' => $ratings
            ]);
        }
        return new Report($items, $total);
    }

    public function getProductPrices(array $skus, int $storeId, int $customerGroupId = 0, float $quantity = 1): ProductPricesReportInterface
    {
        if ($storeId < 1 || $customerGroupId < 0 || !is_finite($quantity) || $quantity <= 0
            || count($skus) < 1 || count($skus) > 100) {
            throw new InputException(__('Provide 1-100 SKUs, a store, customer group and positive quantity.'));
        }
        foreach ($skus as $sku) {
            if (!is_string($sku) || trim($sku) === '') {
                throw new InputException(__('Each SKU must be a nonempty string.'));
            }
        }
        $store = $this->stores->getStore($storeId);
        $this->groups->getById($customerGroupId);
        $websiteId = (int) $store->getWebsiteId();
        $collection = $this->products->create()->setStoreId($storeId);
        $collection->addStoreFilter($storeId)->addAttributeToSelect(['name', 'price', 'tax_class_id']);
        $collection->addAttributeToFilter('sku', ['in' => $skus])->addPriceData($customerGroupId, $websiteId);
        $collection->addTierPriceData();
        $found = [];
        foreach ($collection as $product) {
            $found[$product->getSku()] = $product;
        }
        $items = [];
        foreach (array_unique($skus) as $sku) {
            if (!isset($found[$sku])) {
                $items[] = new ProductPrice(['sku' => $sku, 'found' => false, 'reason' => 'Product not assigned to this website or price index entry unavailable']);
                continue;
            }
            $product = $found[$sku];
            $items[] = new ProductPrice(array_merge([
                'sku' => $sku, 'found' => true, 'name' => $product->getName(), 'store_id' => $storeId,
                'website_id' => $websiteId, 'customer_group_id' => $customerGroupId, 'quantity' => $quantity,
                'currency' => $store->getBaseCurrencyCode(),
                'catalog_prices_include_tax' => $this->config->isSetFlag('tax/calculation/price_includes_tax', ScopeInterface::SCOPE_STORE, $storeId)
            ], $this->priceCalculator->calculate($product->getData(), $product->getData('tier_price') ?: [], $websiteId, $customerGroupId, $quantity)));
        }
        return new Report($items, count($items));
    }
}
