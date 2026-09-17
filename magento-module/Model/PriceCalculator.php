<?php
declare(strict_types=1);

namespace Elgentos\McpMerchant\Model;

/** Combines current indexed final price with eligible configured tier rules. */
class PriceCalculator
{
    public function calculate(array $product, array $tiers, int $websiteId, int $groupId, float $quantity): array
    {
        $regular = isset($product['price']) ? (float) $product['price'] : null;
        $final = isset($product['final_price']) ? (float) $product['final_price'] : null;
        $applicable = [];
        foreach ($tiers as $tier) {
            $tierWebsite = (int) ($tier['website_id'] ?? 0);
            $allGroups = (bool) ($tier['all_groups'] ?? false);
            $tierGroup = (int) ($tier['cust_group'] ?? $tier['customer_group_id'] ?? -1);
            if (($tierWebsite !== 0 && $tierWebsite !== $websiteId)
                || (!$allGroups && $tierGroup !== 32000 && $tierGroup !== $groupId)
                || (float) ($tier['price_qty'] ?? $tier['qty'] ?? 0) > $quantity) {
                continue;
            }
            $percent = $tier['percentage_value'] ?? null;
            $fixed = $tier['website_price'] ?? $tier['price'] ?? $tier['value'] ?? null;
            $value = $percent !== null && $regular !== null
                ? $regular * (1 - (float) $percent / 100) : ($fixed !== null ? (float) $fixed : null);
            if ($value !== null) {
                $applicable[] = $value;
            }
        }
        $simple = in_array($product['type_id'] ?? '', ['simple', 'virtual', 'downloadable'], true);
        $unit = $simple && $final !== null ? min(array_merge([$final], $applicable)) : null;
        return [
            'regular_price' => $regular,
            'indexed_final_price' => $final,
            'minimum_price' => isset($product['min_price']) ? (float) $product['min_price'] : null,
            'maximum_price' => isset($product['max_price']) ? (float) $product['max_price'] : null,
            'unit_price' => $unit !== null ? round(max(0, $unit), 4) : null,
            'index_available' => $final !== null,
            'price_note' => $simple
                ? 'Current indexed catalog price plus eligible tiers; excludes custom options and address-specific checkout tax.'
                : 'Composite product: use a variant/component SKU for a unit price; indexed min/max show the catalog range.'
        ];
    }
}
