<?php
declare(strict_types=1);

// Standalone tests: PHP 8.1+ and SimpleXML, no Magento installation or database.
spl_autoload_register(static function (string $class): void {
    $prefix = 'Elgentos\\McpMerchant\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__ . '/../magento-module/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    }
});

use Elgentos\McpMerchant\Model\PriceCalculator;
use Elgentos\McpMerchant\Model\ProductPrice;
use Elgentos\McpMerchant\Model\ProductReview;
use Elgentos\McpMerchant\Model\Rating;
use Elgentos\McpMerchant\Model\Report;
use Elgentos\McpMerchant\Model\SearchTerm;

function same(mixed $expected, mixed $actual): void
{
    if ($actual !== $expected) {
        throw new RuntimeException('Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$calculator = new PriceCalculator();
$product = ['type_id' => 'simple', 'price' => 100, 'final_price' => 90, 'min_price' => 90, 'max_price' => 90];
$tests = [];
$tests['tier eligibility respects quantity, website and customer group'] = static function () use ($calculator, $product): void {
    $tiers = [
        ['website_id' => 1, 'cust_group' => 2, 'price_qty' => 5, 'website_price' => 80],
        ['website_id' => 2, 'cust_group' => 2, 'price_qty' => 1, 'website_price' => 1],
        ['website_id' => 1, 'cust_group' => 3, 'price_qty' => 1, 'website_price' => 2],
        ['website_id' => 1, 'cust_group' => 2, 'price_qty' => 20, 'website_price' => 3]
    ];
    same(90.0, $calculator->calculate($product, $tiers, 1, 2, 4)['unit_price']);
    same(80.0, $calculator->calculate($product, $tiers, 1, 2, 5)['unit_price']);
};
$tests['percentage tiers use regular price without stacking discounts'] = static function () use ($calculator, $product): void {
    $tiers = [['all_groups' => 1, 'price_qty' => 2, 'percentage_value' => 25, 'website_price' => 0]];
    same(75.0, $calculator->calculate($product, $tiers, 1, 2, 2)['unit_price']);
    $product['final_price'] = 60;
    same(60.0, $calculator->calculate($product, $tiers, 1, 2, 2)['unit_price']);
};
$tests['global all-group tiers, fractional quantities and free prices are retained'] = static function () use ($calculator, $product): void {
    $tiers = [['website_id' => 0, 'customer_group_id' => 32000, 'qty' => 1.5, 'value' => 0]];
    same(90.0, $calculator->calculate($product, $tiers, 3, 7, 1)['unit_price']);
    same(0.0, $calculator->calculate($product, $tiers, 3, 7, 1.5)['unit_price']);
};
$tests['composites and missing price indexes are not fabricated unit prices'] = static function () use ($calculator, $product): void {
    $product['type_id'] = 'configurable';
    $product['max_price'] = 150;
    $result = $calculator->calculate($product, [], 1, 2, 1);
    same(null, $result['unit_price']);
    same(90.0, $result['minimum_price']);
    same(150.0, $result['maximum_price']);
    $result = $calculator->calculate(['type_id' => 'simple', 'price' => 100], [], 1, 2, 1);
    same(false, $result['index_available']);
    same(null, $result['unit_price']);
};

/** Check nested DTOs against the declared Magento REST contracts (mixed[] serializes rows as strings). */
function checkContract(object $object, string $interface): void
{
    same(true, $object instanceof $interface);
    foreach ((new ReflectionClass($interface))->getMethods() as $method) {
        preg_match('/@return\s+([^\s*]+)/', $method->getDocComment() ?: '', $match);
        if (!isset($match[1])) {
            throw new RuntimeException('Missing REST return annotation for ' . $method->getName());
        }
        $type = explode('|', $match[1])[0];
        $value = $object->{$method->getName()}();
        if ($value === null && str_contains($match[1], '|null')) {
            continue;
        }
        if (str_ends_with($type, '[]')) {
            $itemType = substr($type, 0, -2);
            same(true, interface_exists($itemType));
            foreach ($value as $row) {
                checkContract($row, $itemType);
            }
        } else {
            $actualType = ['integer' => 'int', 'double' => 'float', 'boolean' => 'bool'][gettype($value)] ?? gettype($value);
            same($type, $actualType);
        }
    }
}
$tests['REST reports contain typed nested objects, including review ratings and missing prices'] = static function (): void {
    $term = new SearchTerm(['id' => 1, 'query' => 'panels', 'store_id' => 2, 'popularity' => 12, 'num_results' => 0]);
    checkContract(new Report([$term], 1), Elgentos\McpMerchant\Api\Data\SearchTermsReportInterface::class);
    $review = new ProductReview(['id' => 1, 'sku' => 'SKU', 'product_id' => 5, 'status' => 'pending',
        'title' => 'Review', 'detail' => 'Text', 'nickname' => 'Buyer', 'created_at' => '2026-08-01 00:00:00',
        'ratings' => [new Rating(['rating_id' => 2, 'value' => 4, 'percent' => 80])]]);
    checkContract(new Report([$review], 1), Elgentos\McpMerchant\Api\Data\ProductReviewsReportInterface::class);
    $price = new ProductPrice(['sku' => 'SKU', 'found' => true, 'unit_price' => 12, 'catalog_prices_include_tax' => false]);
    $missing = new ProductPrice(['sku' => 'MISSING', 'found' => false, 'reason' => 'Not indexed']);
    checkContract(new Report([$price, $missing], 2), Elgentos\McpMerchant\Api\Data\ProductPricesReportInterface::class);
    same(12.0, $price->getUnitPrice());
    same(null, $missing->getUnitPrice());
};
$tests['all module endpoints are read-only and require a declared integration ACL'] = static function (): void {
    $base = __DIR__ . '/../magento-module/etc/';
    $webapi = simplexml_load_file($base . 'webapi.xml');
    $acl = simplexml_load_file($base . 'acl.xml');
    $resources = array_map(static fn ($node) => (string) $node['id'], $acl->xpath('//resource'));
    same(3, count($webapi->route));
    foreach ($webapi->route as $route) {
        same('GET', (string) $route['method']);
        $resource = (string) $route->resources->resource['ref'];
        same(true, in_array($resource, $resources, true));
        same(true, str_starts_with($resource, 'Elgentos_McpMerchant::'));
        same(true, method_exists((string) $route->service['class'], (string) $route->service['method']));
    }
};

foreach ($tests as $name => $run) {
    $run();
    echo 'PASS ' . $name . PHP_EOL;
}
echo count($tests) . ' PHP tests passed.' . PHP_EOL;
