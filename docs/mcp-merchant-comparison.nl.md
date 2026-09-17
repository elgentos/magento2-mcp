Magento MCP-tools voor merchants — inventarisatie en advies

Onderzocht op 17 september 2026. Dit document vergelijkt de geregistreerde tools in de broncode met de mogelijkheden van onze MCP op commit 93783dd. Geen live Magento-installaties getest. Beschikbaarheid in een winkel hangt ook af van geïnstalleerde modules, API-endpoints en rechten.

De selectie omvat verkoop, klantenservice, assortiment, voorraad, content en marketing. Technische diagnose, SQL, cache, indexers, deployment en beheer van technische toegangsaccounts vallen buiten de selectie. De toolnamen hieronder bestaan daadwerkelijk in de onderzochte broncode; namen in de advieslijst zijn voorstellen voor onze MCP.

**Overzicht**

| Project | Merchantgerichte dekking | Belangrijk verschil |
| --- | --- | --- |
| Freento | 15 geselecteerde uitleestools | Orders, winkelwagens, creditnota’s, klanten, prijzen, voorraad en promoties. |
| Magebit | 2 winkeltools in de basis + 143 tools in negen onderzochte uitbreidingen | De uitbreidingen zijn afzonderlijke modules; GA4 valt ook buiten het suitepakket. |
| MageMCP | 42 backofficetools + 18 tools voor een winkel-/klantassistent | Veel dagelijkse lees- en beheeracties via REST en GraphQL. |
| Adwise | Geen gespecialiseerde merchanttools in de huidige registratie | De meegeleverde tools zijn gericht op technisch beheer. |
| Agento | Geen gespecialiseerde merchanttools; algemene commandotool kan onder meer klantacties uitvoeren | Broncode registreert één algemene magerun-tool, niet alle aparte namen uit de README. |

**Freento**

Gecontroleerd tegen de [toolregistratie](https://github.com/freento/magento-2-mcp/blob/9e2e462635913fad2432956243769880b25baa3d/etc/di.xml) en [tools](https://github.com/freento/magento-2-mcp/blob/9e2e462635913fad2432956243769880b25baa3d/Model/Tool/GetOrders.php).

| Onderwerp | Toolcalls | Merchantgebruik |
| --- | --- | --- |
| Orders en analyse | `get_orders`, `get_order_items` | Orders en orderregels ophalen; orders filteren, totaliseren en groeperen, bijvoorbeeld per maand, klant, status of betaalmethode. |
| Winkelwagens | `get_quotes`, `get_quote_items` | Open en oudere winkelwagens en hun inhoud onderzoeken. |
| Terugbetalingen | `get_creditmemos` | Creditnota’s opzoeken voor refundanalyse. |
| Assortiment | `get_products`, `get_categories` | Producten en categorieën zoeken en uitlezen. |
| Prijzen | `get_product_prices`, `get_product_tier_prices` | Prijzen per website/klantgroep en staffelprijzen bekijken. |
| Voorraad | `get_stock_single_stock` | Voorraadaantallen, voorraadstatus en bestelgrenzen bekijken; dit is de single-stock-tool. |
| Klanten | `get_customers` | Klantaccounts zoeken en filteren. |
| Promoties | `get_cart_price_rules`, `get_coupons` | Winkelwagenkortingen en kortingscodes onderzoeken. |
| Belasting en winkels | `get_tax_rules`, `get_stores` | Belastingregels en de indeling van websites, winkels en storeviews uitlezen. |

**Magebit**

De [basismodule](https://github.com/magebitcom/magento2-mcp-module/blob/c08b83355b516f3b1c9bd36ca755a5f39d649236/README.md) bevat vooral infrastructuur en systeemtools. De onderstaande merchantfuncties komen grotendeels uit de apart gepubliceerde modules waar deze repository naar verwijst. Alle namen zijn gecontroleerd in hun eigen toolregistraties.

Winkelcontext uit de basis: `system.store.list`, `system.store.info`. Hiermee worden winkels/storeviews en hun details vindbaar.

**Orders en klantenservice — 19 tools.** Orders en regels zoeken; facturen, zendingen, tracking, betalingen/transacties, opmerkingen en creditnota’s bekijken. Ook facturen, zendingen, tracking en creditnota’s aanmaken; orders annuleren, vasthouden en vrijgeven. [Broncode](https://github.com/magebitcom/magento2-mcp-order-tools/blob/7d2b460617665c0b77e0518ba962efe785b7f950/etc/di.xml).

`sales.order.list`, `sales.order.get`, `sales.order.item.list`, `sales.order.invoices`, `sales.order.invoice.get`, `sales.order.shipments`, `sales.order.shipment.get`, `sales.order.payment`, `sales.order.comments`, `sales.order.credit_memos`, `sales.order.credit_memo.get`, `sales.order.invoice.create`, `sales.order.shipment.create`, `sales.order.shipment.track.add`, `sales.order.credit_memo.create`, `sales.order.cancel`, `sales.order.hold`, `sales.order.unhold`, `sales.order.comment.add`

**Assortiment — 14 tools.** Producten en categorieën zoeken, bekijken, aanmaken, aanpassen en verwijderen. Productafbeeldingen beheren en voorraad aantallen aanpassen. [Broncode](https://github.com/magebitcom/magento2-mcp-catalog-tools/blob/b6fa00f8e68b7d8ad015f2e593bd024fdfe4fbe1/etc/di.xml).

`catalog.product.list`, `catalog.product.get`, `catalog.category.list`, `catalog.category.get`, `catalog.product.create`, `catalog.product.update`, `catalog.product.delete`, `catalog.category.create`, `catalog.category.update`, `catalog.category.delete`, `catalog.product.stock.set`, `catalog.product.media.add`, `catalog.product.media.update`, `catalog.product.media.remove`

**Klanten — 15 tools.** Klanten, adressen en klantgroepen bekijken; klanten en adressen aanmaken, wijzigen en verwijderen. Accountbevestiging controleren/versturen en wachtwoordherstel starten. [Broncode](https://github.com/magebitcom/magento2-mcp-customer-tools/blob/1efd4df5eeb796b83a720c2b7c60cc5e72df8d75/etc/di.xml).

`customer.customer.list`, `customer.customer.get`, `customer.customer.create`, `customer.customer.update`, `customer.customer.delete`, `customer.address.list`, `customer.address.get`, `customer.address.create`, `customer.address.update`, `customer.address.delete`, `customer.group.list`, `customer.group.get`, `customer.account.confirmation_status`, `customer.account.reset_password`, `customer.account.resend_confirmation`

**Voorraad en magazijnen — 22 tools.** Verkoopbare voorraad, reserveringseffect en aantallen per magazijn bekijken. Voorraad en bestelinstellingen aanpassen; bronnen, stocks en websitekoppelingen beheren; voorraad geheel of gedeeltelijk verplaatsen. [Broncode](https://github.com/magebitcom/magento2-mcp-inventory-tools/blob/28265cd3a59037a5030336405dc81de9b23d16d2/etc/di.xml).

`inventory.source.list`, `inventory.source.get`, `inventory.stock.list`, `inventory.stock.get`, `inventory.source_item.list`, `inventory.salable_qty.get`, `inventory.stock_item_configuration.get`, `inventory.source.create`, `inventory.source.update`, `inventory.stock.create`, `inventory.stock.update`, `inventory.stock.delete`, `inventory.stock.assign_sources`, `inventory.stock.unassign_sources`, `inventory.stock.set_sales_channels`, `inventory.source_item.set`, `inventory.source_item.delete`, `inventory.stock_item_configuration.set`, `inventory.bulk.source_assign`, `inventory.bulk.source_unassign`, `inventory.bulk.transfer`, `inventory.bulk.partial_transfer`

**Content — 10 tools.** CMS-pagina’s en contentblokken zoeken, bekijken, aanmaken, aanpassen en verwijderen. [Broncode](https://github.com/magebitcom/magento2-mcp-cms-tools/blob/318710b37fb49fb6471aa61213bdba3b6aebf7e3/etc/di.xml).

`cms.page.list`, `cms.page.get`, `cms.block.list`, `cms.block.get`, `cms.page.create`, `cms.page.update`, `cms.page.delete`, `cms.block.create`, `cms.block.update`, `cms.block.delete`

**Promoties — 13 tools.** Catalogus- en winkelwagenregels bekijken, activeren/deactiveren en verwijderen. Catalogusregels laten toepassen; coupons opzoeken, genereren en verwijderen. Deze module registreert geen algemene tool om nieuwe kortingsregels aan te maken. [Broncode](https://github.com/magebitcom/magento2-mcp-marketing-tools/blob/858ab464aa40da83ca36c18133069d6c3a170719/etc/di.xml).

`marketing.catalog_rule.list`, `marketing.catalog_rule.get`, `marketing.catalog_rule.delete`, `marketing.catalog_rule.set_active`, `marketing.catalog_rule.apply_all`, `marketing.cart_rule.list`, `marketing.cart_rule.get`, `marketing.cart_rule.delete`, `marketing.cart_rule.set_active`, `marketing.cart_rule.coupon.list`, `marketing.cart_rule.coupon.get`, `marketing.cart_rule.coupon.generate`, `marketing.cart_rule.coupon.delete`

**Belastingen en valuta — 18 tools.** Belastingklassen, tarieven en regels bekijken en beheren. Valutaconfiguratie bekijken en wisselkoersen instellen of importeren. [Broncode](https://github.com/magebitcom/magento2-mcp-tax-tools/blob/7af7b6f563a4b1b416b36ee685f29856e08cd28d/etc/di.xml).

`tax.class.list`, `tax.class.get`, `tax.rate.list`, `tax.rate.get`, `tax.rule.list`, `tax.rule.get`, `tax.rate.create`, `tax.rate.update`, `tax.rate.delete`, `tax.rule.create`, `tax.rule.update`, `tax.rule.delete`, `tax.class.create`, `tax.class.update`, `tax.class.delete`, `directory.currency.info`, `directory.currency.rate.set`, `directory.currency.rate.import`

**Rapportages — 25 tools.** Winkelwageninhoud en verlaten carts, zoektermen, nieuwsbriefproblemen, reviews, omzet, belasting, facturatie, verzending, refunds en coupons. Ook klanten, bezoekers, productviews, bestsellers, lage voorraad, bestelde aantallen, downloads en een dashboard. Rapportstatistieken controleren/verversen. Een deel gebruikt Magento’s vooraf berekende rapporttabellen en hangt dus af van de laatste verversing. [Broncode](https://github.com/magebitcom/magento2-mcp-report-tools/blob/eaff7dec7aeaa1e1c98062b41980abb1865f8a9d/etc/di.xml).

`reports.cart.products`, `reports.cart.abandoned`, `reports.marketing.search_terms`, `reports.marketing.newsletter_problems`, `reports.reviews.by_product`, `reports.reviews.by_customer`, `reports.sales.orders`, `reports.sales.tax`, `reports.sales.invoiced`, `reports.sales.shipping`, `reports.sales.refunds`, `reports.sales.coupons`, `reports.customers.orders`, `reports.customers.totals`, `reports.customers.new`, `reports.customers.online`, `reports.products.viewed`, `reports.products.bestsellers`, `reports.products.low_stock`, `reports.products.ordered`, `reports.products.downloads`, `reports.dashboard.summary`, `reports.statistics.status`, `reports.statistics.refresh_recent`, `reports.statistics.refresh_lifetime`

**GA4 — 7 tools.** Analyticsaccounts en properties vinden; Google Ads-koppelingen en beschikbare eigen dimensies/metrics bekijken; gewone, realtime- en funnelrapportages draaien. Vereist een aparte Google-koppeling. [Broncode](https://github.com/magebitcom/magento2-mcp-google-analytics-tools/blob/5b4d1bae589e3e86afbf748bca3a8f853462f1e0/etc/di.xml).

`google_analytics.account.summaries`, `google_analytics.property.get`, `google_analytics.property.google_ads_links`, `google_analytics.property.custom_dimensions_and_metrics`, `google_analytics.report.run`, `google_analytics.report.run_realtime`, `google_analytics.report.run_funnel`

**MageMCP / Magendoo**

De [serverregistratie](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/server.py) laadt 42 tools voor medewerkers (`admin_*`) en 18 voor klantgerichte assistentie (`c_*`). De tweede groep kan voor een merchant nuttig zijn bij begeleide verkoop, het beantwoorden van productvragen en het samenstellen van bestellingen.

| Merchantgebruik | Exacte toolcalls |
| --- | --- |
| Omzet, orderaantallen, AOV en bestsellers; groepering van omzet/aantallen per dag, week, maand of status. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/analytics.py) | `admin_get_analytics` |
| Meerdere producten of voorraadposities tegelijk bijwerken en voortgang controleren. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/bulk.py) | `admin_bulk_inventory_update`, `admin_bulk_catalog_update`, `admin_get_bulk_status` |
| CMS-pagina’s zoeken, lezen en bijwerken, inclusief content en metadata. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/cms.py) | `admin_get_cms_page`, `admin_search_cms_pages`, `admin_update_cms_page` |
| Bestelhistorie van een klant. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/customer_orders.py) | `admin_get_customer_orders` |
| Klantprofiel, adressen en aanvullende klantgegevens. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/get_customer.py) | `admin_get_customer` |
| Verkoopbare aantallen en beschikbaarheid voor meerdere SKU’s. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/get_inventory.py) | `admin_get_inventory` |
| Orderdetails, waaronder betaling en statushistorie; de aanwezigheid van gekoppelde documenten hangt mede af van de API-respons. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/get_order.py) | `admin_get_order` |
| Facturen zoeken/lezen en een creditnota opvragen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/invoices.py) | `admin_get_invoice`, `admin_search_invoices`, `admin_get_credit_memo` |
| Order annuleren, vasthouden/vrijgeven, opmerking toevoegen, factuur of zending maken, orderbevestiging opnieuw versturen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/order_actions.py) | `admin_cancel_order`, `admin_hold_order`, `admin_unhold_order`, `admin_add_order_comment`, `admin_create_invoice`, `admin_create_shipment`, `admin_send_order_email` |
| Trackingnummers bij een order opvragen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/order_tracking.py) | `admin_get_order_tracking` |
| Producten zoeken/lezen, productattributen en opties bekijken, productgegevens wijzigen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/products.py) | `admin_search_products`, `admin_get_product`, `admin_get_product_attribute`, `admin_update_product` |
| Winkelwagenkortingsregels zoeken/lezen en couponcodes genereren. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/promotions.py) | `admin_search_sales_rules`, `admin_get_sales_rule`, `admin_generate_coupons` |
| Actieve en oudere winkelwagens zoeken. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/quotes.py) | `admin_search_quotes` |
| RMA-retouraanvragen zoeken en bekijken; vereist passende Commerce/RMA-endpoints. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/returns.py) | `admin_search_returns`, `admin_get_return` |
| Reviews opzoeken en modereren; zie de compatibiliteitsopmerking hieronder. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/reviews.py) | `admin_get_product_reviews`, `admin_get_review`, `admin_moderate_review` |
| Klanten zoeken en beschikbare klantgroepen bekijken. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/search_customers.py) | `admin_get_customer_groups`, `admin_search_customers` |
| Orders zoeken op onder meer klant, status, periode en bedrag. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/search_orders.py) | `admin_search_orders` |
| Zendingen zoeken en bekijken. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/shipments.py) | `admin_get_shipment`, `admin_search_shipments` |
| Websites, winkels en storeviews bekijken. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/store_hierarchy.py) | `admin_get_store_hierarchy` |
| Voorraadaantallen per MSI-bron aanpassen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/update_inventory.py) | `admin_update_inventory` |
| Een winkelwagen maken en uitlezen, artikelen en coupon beheren, contact/adressen en verzend-/betaalmethode instellen en een order plaatsen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/cart.py) | `c_create_cart`, `c_get_cart`, `c_add_to_cart`, `c_update_cart_item`, `c_apply_coupon`, `c_set_guest_email`, `c_set_shipping_address`, `c_set_billing_address`, `c_set_shipping_method`, `c_set_payment_method`, `c_place_order` |
| Categorieboom en aantallen producten bekijken. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/get_categories.py) | `c_get_categories` |
| Productdetails zoals afbeeldingen, tekst en varianten bekijken. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/get_product.py) | `c_get_product` |
| Een retouraanvraag starten via GraphQL; Adobe Commerce/RMA nodig. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/initiate_return.py) | `c_initiate_return` |
| Winkelinformatie zoals verzend- en retourbeleid ophalen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/policy_page.py) | `c_get_policy_page` |
| Bepalen welk product, welke categorie of CMS-pagina bij een winkel-URL hoort. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/resolve_url.py) | `c_resolve_url` |
| Het storefrontassortiment doorzoeken, inclusief filters en beschikbare filterwaarden. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/search_products.py) | `c_search_products` |
| Taal, valuta en winkel-URL’s ophalen. [Code](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/customer/store_config.py) | `c_get_store_config` |

Compatibiliteit: de [reviewtools](https://github.com/magendooro/magemcp/blob/1eaab67683f4cddaf3f1e187d6d391374e40f42d/src/magemcp/tools/admin/reviews.py) gebruiken onder meer `/V1/products/review` en `/V1/reviews/...`. De [standaard Review-module](https://github.com/magento/magento2/tree/2.4-develop/app/code/Magento/Review/etc) declareert deze REST-routes niet. Deze geregistreerde tools zijn daarom geen bewijs dat reviewbeheer zonder aanvullende Magento-module werkt. De productreviewfilter gebruikt bovendien SKU als `entity_pk_value`; dat moet bij overname op de daadwerkelijke review-API worden afgestemd.

Een actieve winkelwagen is niet automatisch verlaten: voor onze implementatie is een expliciete inactiviteitsgrens nodig. RMA-retouraanvragen en financiële creditnota’s zijn verschillende processen. De aanwezigheid van creditnota’s betekent niet dat de winkel ook een RMA-module heeft.

**Adwise**

De [registratie](https://github.com/adwise/magento2-mcp/blob/72a02485083b6ba3929a4c0c7680e578c16a03ff/etc/di.xml) bevat vijf technische beheer-/diagnosetools. Er zijn in deze versie geen gespecialiseerde tools voor orders, klanten, catalogusbeheer, promoties of merchantrapportages. Binnen deze selectie is er daarom geen functionaliteit om over te nemen.

**Genaker / Agento**

De [huidige broncode](https://github.com/Genaker/Agento_MCP/blob/bc9f8351e80b737f97a732e0338f6e997210b009/Mcp/Tools/MagerunTool.php) registreert een algemene `magerun`-tool. Daarmee zijn onder andere n98-magerun-klantcommando’s bereikbaar, bijvoorbeeld klantgegevens opvragen of accounts beheren, afhankelijk van de geïnstalleerde commando’s. De README noemt aparte namen zoals `magerun_customer`, maar die staan niet als aparte MCP-tools in deze versie van de code. De overige geregistreerde tools zijn technisch en vallen buiten deze selectie. Voor ons is alleen de zakelijke functie klantbeheer relevant, via gerichte tools zoals bij MageMCP/Magebit.

**Wat onze MCP al heeft**

Onze versie heeft 18 geregistreerde tools. Producten zoeken/lezen, categorieën, gerelateerde producten, voorraad per SKU, attributen lezen/wijzigen en bestelde producten per klant zijn aanwezig. De recente uitbreiding voegt orderdetails en orderregels, complete productverkopen, categorieverkopen en maandelijkse omzet/AOV toe.

Daarmee hoeven we de basale product-, order- en omzettools van de andere projecten niet opnieuw te bouwen. Een aantal mogelijkheden vraagt vooral uitbreiding van bestaande responses: klantkoppeling, betaalinformatie, tracking en statushistorie van orders; groepering van rapporten per dag/week, klant, betaalmethode en winkel.

**Voorgestelde aanvullingen, op prioriteit**

De onderstaande prioriteiten vormden het voorstel op basis van merchantwaarde. Inmiddels zijn alle tools onder prioriteit 1 en 2 geïmplementeerd, inclusief de uitbreidingen van `get_revenue` en `get_order`. Zie de [toolhandleiding](merchant-tools.md) en de [aanvullende Magento-module](../magento-module/README.md) voor gebruik en installatie. Prioriteit 3 blijft een voorstel.

| Prioriteit | Voorstel | Merchantvraag / resultaat | Inspiratie en uitvoering |
| --- | --- | --- | --- |
| 1 | `get_abandoned_carts`, `get_cart` | Welke waardevolle winkelwagens zijn al minstens 24 uur niet meer aangepast, en welke producten zitten erin? | Freento, MageMCP en Magebit Reports. Gebaseerd op quotes, items en totalen; inactiviteitsgrens en bereik van gastcarts expliciet maken. |
| 1 | `get_credit_memos`, `get_refund_report`; uitbreiding get_revenue | Wat is de omzet na refunds en welke producten worden vaak terugbetaald? | Alle drie. Creditnota’s koppelen aan orders/regels; expliciet kiezen tussen datum van refund en oorspronkelijke orderdatum. Geen RMA nodig voor financiële refunds. |
| 1 | `get_customers`, `get_customer`, `get_customer_groups`, `get_customer_analytics` | Wie zijn onze beste klanten, hoeveel kopen voor het eerst en wie heeft lang niet besteld? | Freento, MageMCP en Magebit. Klantdata koppelen aan orders. Terugkerende klanten, bestelwaarde en inactiviteit zijn onze eigen samengestelde analyses. |
| 1 | `get_inventory`, `get_low_stock_products`, `get_inventory_risk` | Welke goedverkopende producten dreigen uit voorraad te raken en wat verkoopt nauwelijks? | Magebit Inventory/Reports en MageMCP. Verkoopbare MSI-voorraad in batches combineren met onze verkopen. Voorraadduur is een berekende schatting op basis van gekozen verkoopperiode. |
| 1 | `get_order_tracking`, `get_invoices`; rijkere get_order | Is deze order betaald, gefactureerd en verzonden? Wat staat er in de orderhistorie? | Magebit Orders en MageMCP. Betalingen, facturen, verzendingen en opmerkingen toevoegen aan het klantservicedossier. Trackingnummer is nog geen live bezorgstatus van de vervoerder. |
| 2 | `get_sales_rules`, `get_coupons`, `get_coupon_performance` | Welke acties lopen, hoe vaak worden codes gebruikt en hoeveel korting geven we weg? | Freento en Magebit Marketing/Reports; MageMCP voor regels/codes. Promoties aan orderdata koppelen. Gebruik en omzet tonen, niet zonder experiment claimen dat de actie extra omzet veroorzaakte. |
| 2 | `get_product_prices`, `get_product_tier_prices` | Welke prijs en staffelkorting ziet een zakelijke klant op deze website? | Freento en Magebit Catalog. Prijscontext expliciet maken: website, klantgroep, aantallen en geldigheidsperiode. |
| 2 | `search_cms_pages`, `get_cms_page`, `update_cms_page`, `get_cms_blocks` | Welke pagina’s bevatten verouderde informatie en kunnen teksten/metagegevens worden bijgewerkt? | MageMCP en Magebit CMS. CMS ontsluiten; producttekstbewerking deels al aanwezig via onze attribuuttool. |
| 2 | `get_search_terms`, `get_product_reviews` | Waar zoeken bezoekers naar zonder resultaten? Welke producten krijgen slechte beoordelingen? | Magebit Reports en MageMCP. Zoektermen en reviewbeheer vragen aanvullende Magento-endpoints of een passende module; publieke reviews kunnen via GraphQL een alternatief bieden. |
| 3 | `generate_coupons`, `update_inventory`, `bulk_update_products` | Een reeks kortingscodes maken of veel prijzen/voorraadposities tegelijk wijzigen. | MageMCP en Magebit. Uitbreiding van merchantbeheer wanneer schrijfacties gewenst zijn; bestaande productattribuut-update behouden. |
| 3 | `add_order_comment`, `hold_order`, `cancel_order`, `create_shipment`, `create_invoice`, `create_credit_memo` | Dagelijkse klantenservice- en fulfilmenthandelingen vanuit de AI uitvoeren. | Magebit Orders en MageMCP; creditnota aanmaken aanwezig bij Magebit. Sommige acties versturen berichten of voeren een betaling/refund uit. |
| 3 | `get_ga4_report`, `get_conversion_funnel` | Hoe verschillen verkeer, checkout-uitval en omzet per marketingkanaal? | Magebit Google Analytics. Aanvullende Google-koppeling en correcte e-commercetracking nodig; dit volgt niet alleen uit Magento-orderdata. |
| 3 | `get_returns`, `get_return`, `initiate_return` | Welke retouraanvragen wachten op behandeling? | MageMCP. Alleen activeren bij aanwezige Adobe Commerce/RMA- of andere retourmodule met passende API. |

De geïmplementeerde rapporten over klanten, voorraadrisico en couponprestaties zijn deels eigen combinaties van bestaande gegevensbronnen, geen letterlijk gekopieerde tools.

Veel basisgegevens zijn via standaard REST/GraphQL te ontsluiten. De Magento-modules van Freento en Magebit hebben daarnaast rechtstreeks toegang tot Magento-collecties en rapporttabellen; hun mogelijkheden zijn daarom niet automatisch één-op-één beschikbaar voor onze externe Node-server. Voor zoektermen, uitgebreid reviewbeheer en bepaalde rapportages is een kleine aanvullende Magento-module een mogelijke route. De standaard [cart-API](https://github.com/magento/magento2/blob/2.4-develop/app/code/Magento/Quote/etc/webapi.xml) biedt bijvoorbeeld wel cartzoekopdrachten en orderregelachtige cart-items.

**Onderzochte revisies**

| Repository | Commit |
| --- | --- |
| freento/magento-2-mcp | [9e2e462](https://github.com/freento/magento-2-mcp/commit/9e2e462635913fad2432956243769880b25baa3d) |
| magebitcom/magento2-mcp-module | [c08b833](https://github.com/magebitcom/magento2-mcp-module/commit/c08b83355b516f3b1c9bd36ca755a5f39d649236) |
| magendooro/magemcp | [1eaab67](https://github.com/magendooro/magemcp/commit/1eaab67683f4cddaf3f1e187d6d391374e40f42d) |
| adwise/magento2-mcp | [72a0248](https://github.com/adwise/magento2-mcp/commit/72a02485083b6ba3929a4c0c7680e578c16a03ff) |
| Genaker/Agento_MCP | [bc9f835](https://github.com/Genaker/Agento_MCP/commit/bc9f8351e80b737f97a732e0338f6e997210b009) |
| magebitcom/magento2-mcp-order-tools | [7d2b460](https://github.com/magebitcom/magento2-mcp-order-tools/commit/7d2b460617665c0b77e0518ba962efe785b7f950) |
| magebitcom/magento2-mcp-catalog-tools | [b6fa00f](https://github.com/magebitcom/magento2-mcp-catalog-tools/commit/b6fa00f8e68b7d8ad015f2e593bd024fdfe4fbe1) |
| magebitcom/magento2-mcp-customer-tools | [1efd4df](https://github.com/magebitcom/magento2-mcp-customer-tools/commit/1efd4df5eeb796b83a720c2b7c60cc5e72df8d75) |
| magebitcom/magento2-mcp-inventory-tools | [28265cd](https://github.com/magebitcom/magento2-mcp-inventory-tools/commit/28265cd3a59037a5030336405dc81de9b23d16d2) |
| magebitcom/magento2-mcp-cms-tools | [318710b](https://github.com/magebitcom/magento2-mcp-cms-tools/commit/318710b37fb49fb6471aa61213bdba3b6aebf7e3) |
| magebitcom/magento2-mcp-marketing-tools | [858ab46](https://github.com/magebitcom/magento2-mcp-marketing-tools/commit/858ab464aa40da83ca36c18133069d6c3a170719) |
| magebitcom/magento2-mcp-tax-tools | [7af7b6f](https://github.com/magebitcom/magento2-mcp-tax-tools/commit/7af7b6f563a4b1b416b36ee685f29856e08cd28d) |
| magebitcom/magento2-mcp-report-tools | [eaff7de](https://github.com/magebitcom/magento2-mcp-report-tools/commit/eaff7dec7aeaa1e1c98062b41980abb1865f8a9d) |
| magebitcom/magento2-mcp-google-analytics-tools | [5b4d1ba](https://github.com/magebitcom/magento2-mcp-google-analytics-tools/commit/5b4d1bae589e3e86afbf748bca3a8f853462f1e0) |
