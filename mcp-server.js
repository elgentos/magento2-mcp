#!/usr/bin/env node
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const axios = require('axios');
const dotenv = require('dotenv');
const { format, parse, parseISO, isValid, addDays, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, isAfter, isBefore } = require('date-fns');

// Load environment variables from .env file
dotenv.config();

// Magento 2 API Configuration
const MAGENTO_BASE_URL = process.env.MAGENTO_BASE_URL || 'https://your-magento-store.com/rest/V1';
const MAGENTO_API_TOKEN = process.env.MAGENTO_API_TOKEN;

// Validate environment variables
if (!MAGENTO_API_TOKEN) {
  console.error('ERROR: MAGENTO_API_TOKEN environment variable is required');
  process.exit(1);
}

// Date parsing utilities
function parseDateExpression(dateExpression) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  
  // Normalize the date expression
  const normalizedExpression = dateExpression.toLowerCase().trim();
  const monthsMatch = normalizedExpression.match(/^(?:last|past) (\d+) months$/);
  if (monthsMatch) {
    const months = Number(monthsMatch[1]);
    if (months < 1 || months > 1200) {
      throw new Error('The number of months must be between 1 and 1200');
    }
    return {
      startDate: new Date(currentYear, currentMonth - months, 1),
      endDate: endOfMonth(new Date(currentYear, currentMonth - 1, 1)),
      description: `Last ${months} complete calendar months`
    };
  }
  
  // Handle relative date expressions
  switch (normalizedExpression) {
    case 'today':
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(now),
        description: 'Today'
      };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return {
        startDate: startOfDay(yesterday),
        endDate: endOfDay(yesterday),
        description: 'Yesterday'
      };
    case 'this week':
      return {
        startDate: startOfWeek(now, { weekStartsOn: 1 }), // Week starts on Monday
        endDate: endOfDay(now),
        description: 'This week'
      };
    case 'last week':
      const lastWeekStart = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
      const lastWeekEnd = subDays(endOfWeek(now, { weekStartsOn: 1 }), 7);
      return {
        startDate: lastWeekStart,
        endDate: lastWeekEnd,
        description: 'Last week'
      };
    case 'this month':
      return {
        startDate: startOfMonth(now),
        endDate: endOfDay(now),
        description: 'This month'
      };
    case 'last month':
      const lastMonth = new Date(currentYear, currentMonth - 1, 1);
      return {
        startDate: startOfMonth(lastMonth),
        endDate: endOfMonth(lastMonth),
        description: 'Last month'
      };
    case 'ytd':
    case 'this ytd':
    case 'this year to date':
    case 'year to date':
      return {
        startDate: startOfYear(now),
        endDate: endOfDay(now),
        description: 'Year to date'
      };
    case 'last year':
      const lastYear = new Date(currentYear - 1, 0, 1);
      return {
        startDate: startOfYear(lastYear),
        endDate: endOfYear(lastYear),
        description: 'Last year'
      };
    default:
      // Try to parse as ISO date or other common formats
      try {
        // Check if it's a single date (not a range)
        const parsedDate = parseISO(normalizedExpression);
        if (isValid(parsedDate)) {
          return {
            startDate: startOfDay(parsedDate),
            endDate: endOfDay(parsedDate),
            description: format(parsedDate, 'yyyy-MM-dd')
          };
        }
        
        // Check if it's a date range in format "YYYY-MM-DD to YYYY-MM-DD"
        const rangeParts = normalizedExpression.split(' to ');
        if (rangeParts.length === 2) {
          const startDate = parseISO(rangeParts[0]);
          const endDate = parseISO(rangeParts[1]);
          
          if (isValid(startDate) && isValid(endDate)) {
            if (isAfter(startDate, endDate)) {
              throw new Error('Start date must not be after end date');
            }
            return {
              startDate: startOfDay(startDate),
              endDate: endOfDay(endDate),
              description: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`
            };
          }
        }
        
        // If we can't parse it, throw an error
        throw new Error(`Unable to parse date expression: ${dateExpression}`);
      } catch (error) {
        throw new Error(`Invalid date expression: ${dateExpression}. ${error.message}`);
      }
  }
}

// Helper function to get the end of a year
function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

// Helper function to format a date for Magento API
function formatDateForMagento(date) {
  return format(date, "yyyy-MM-dd HH:mm:ss");
}

// Helper function to build date range filter for Magento API
function buildDateRangeFilter(field, startDate, endDate) {
  const formattedStartDate = formatDateForMagento(startDate);
  const formattedEndDate = formatDateForMagento(endDate);
  
  return [
    `searchCriteria[filter_groups][0][filters][0][field]=${field}`,
    `searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(formattedStartDate)}`,
    `searchCriteria[filter_groups][0][filters][0][condition_type]=gteq`,
    `searchCriteria[filter_groups][1][filters][0][field]=${field}`,
    `searchCriteria[filter_groups][1][filters][0][value]=${encodeURIComponent(formattedEndDate)}`,
    `searchCriteria[filter_groups][1][filters][0][condition_type]=lteq`
  ].join('&');
}

// Helper function to normalize country input
function normalizeCountry(country) {
  // Normalize the country input (handle both country codes and names)
  const countryInput = country.trim().toLowerCase();
  
  // Map of common country names to ISO country codes
  const countryMap = {
    // Common variations for The Netherlands
    'netherlands': 'NL',
    'the netherlands': 'NL',
    'holland': 'NL',
    'nl': 'NL',
    
    // Common variations for United States
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'america': 'US',
    
    // Common variations for United Kingdom
    'united kingdom': 'GB',
    'uk': 'GB',
    'great britain': 'GB',
    'gb': 'GB',
    'england': 'GB',
    
    // Add more countries as needed
    'canada': 'CA',
    'ca': 'CA',
    
    'australia': 'AU',
    'au': 'AU',
    
    'germany': 'DE',
    'de': 'DE',
    
    'france': 'FR',
    'fr': 'FR',
    
    'italy': 'IT',
    'it': 'IT',
    
    'spain': 'ES',
    'es': 'ES',
    
    'belgium': 'BE',
    'be': 'BE',
    
    'sweden': 'SE',
    'se': 'SE',
    
    'norway': 'NO',
    'no': 'NO',
    
    'denmark': 'DK',
    'dk': 'DK',
    
    'finland': 'FI',
    'fi': 'FI',
    
    'ireland': 'IE',
    'ie': 'IE',
    
    'switzerland': 'CH',
    'ch': 'CH',
    
    'austria': 'AT',
    'at': 'AT',
    
    'portugal': 'PT',
    'pt': 'PT',
    
    'greece': 'GR',
    'gr': 'GR',
    
    'poland': 'PL',
    'pl': 'PL',
    
    'japan': 'JP',
    'jp': 'JP',
    
    'china': 'CN',
    'cn': 'CN',
    
    'india': 'IN',
    'in': 'IN',
    
    'brazil': 'BR',
    'br': 'BR',
    
    'mexico': 'MX',
    'mx': 'MX',
    
    'south africa': 'ZA',
    'za': 'ZA'
  };
  
  // Check if the input is in our map
  if (countryMap[countryInput]) {
    return [countryMap[countryInput]];
  }
  
  // If it's not in our map, assume it's a country code or name and return as is
  // For a more robust solution, we would validate against a complete list of country codes
  return [countryInput.toUpperCase()];
}

// Helper function to fetch all pages for a given search criteria
async function fetchAllPages(endpoint, baseSearchCriteria) {
  const criteria = new URLSearchParams(baseSearchCriteria);
  if (!criteria.has('searchCriteria[pageSize]')) criteria.set('searchCriteria[pageSize]', '100');
  const allItems = [];
  const seen = new Set();
  for (let currentPage = 1; ; currentPage++) {
    criteria.set('searchCriteria[currentPage]', String(currentPage));
    const response = await callMagentoApi(`${endpoint}?${criteria}`);
    if (!Array.isArray(response.items) || !Number.isInteger(Number(response.total_count)) || Number(response.total_count) < 0) {
      throw new Error(`Invalid paginated response from ${endpoint}`);
    }
    for (const item of response.items) {
      const id = item.entity_id ?? item.id;
      if (id !== undefined) {
        if (seen.has(String(id))) throw new Error(`Repeated record while paginating ${endpoint}; refusing incomplete totals`);
        seen.add(String(id));
      }
    }
    allItems.push(...response.items);
    if (allItems.length >= Number(response.total_count)) return allItems;
    if (response.items.length === 0) throw new Error(`Incomplete paginated response from ${endpoint}`);
  }
}

// Create an MCP server
const server = new McpServer({
  name: "magento-mcp-server",
  version: "1.0.0"
});

// Helper function to make authenticated requests to Magento 2 API
async function callMagentoApi(endpoint, method = 'GET', data = null) {
  try {
    const url = `${MAGENTO_BASE_URL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${MAGENTO_API_TOKEN}`,
      'Content-Type': 'application/json'
    };
    
    const config = {
      method,
      url,
      headers,
      data: data ? JSON.stringify(data) : undefined,
      // Bypass SSL certificate verification for development
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    };
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('Magento API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Format product data for better readability
function formatProduct(product) {
  if (!product) return "Product not found";
  
  // Extract custom attributes into a more readable format
  const customAttributes = {};
  if (product.custom_attributes && Array.isArray(product.custom_attributes)) {
    product.custom_attributes.forEach(attr => {
      customAttributes[attr.attribute_code] = attr.value;
    });
  }
  
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    status: product.status,
    visibility: product.visibility,
    type_id: product.type_id,
    created_at: product.created_at,
    updated_at: product.updated_at,
    extension_attributes: product.extension_attributes,
    custom_attributes: customAttributes
  };
}

// Format search results for better readability
function formatSearchResults(results) {
  if (!results || !results.items || !Array.isArray(results.items)) {
    return "No products found";
  }
  
  return {
    total_count: results.total_count,
    items: results.items.map(item => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      price: item.price,
      status: item.status,
      type_id: item.type_id
    }))
  };
}

// Tool: Get product by SKU
server.tool(
  "get_product_by_sku",
  "Get detailed information about a product by its SKU",
  {
    sku: z.string().describe("The SKU (Stock Keeping Unit) of the product")
  },
  async ({ sku }) => {
    try {
      const productData = await callMagentoApi(`/products/${sku}`);
      const formattedProduct = formatProduct(productData);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedProduct, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching product: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Search products
server.tool(
  "search_products",
  "Search for products using Magento search criteria",
  {
    query: z.string().describe("Search query (product name, description, etc.)"),
    page_size: z.number().optional().describe("Number of results per page (default: 10)"),
    current_page: z.number().optional().describe("Page number (default: 1)")
  },
  async ({ query, page_size = 10, current_page = 1 }) => {
    try {
      // Build search criteria for a simple name search
      const searchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=name&` +
                            `searchCriteria[filter_groups][0][filters][0][value]=%25${encodeURIComponent(query)}%25&` +
                            `searchCriteria[filter_groups][0][filters][0][condition_type]=like&` +
                            `searchCriteria[pageSize]=${page_size}&` +
                            `searchCriteria[currentPage]=${current_page}`;
      
      const productData = await callMagentoApi(`/products?${searchCriteria}`);
      const formattedResults = formatSearchResults(productData);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedResults, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching products: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get product categories
server.tool(
  "get_product_categories",
  "Get categories for a specific product by SKU",
  {
    sku: z.string().describe("The SKU (Stock Keeping Unit) of the product")
  },
  async ({ sku }) => {
    try {
      // First get the product to find its category IDs
      const productData = await callMagentoApi(`/products/${sku}`);
      
      // Find category IDs in custom attributes
      const categoryAttribute = productData.custom_attributes?.find(
        attr => attr.attribute_code === 'category_ids'
      );
      
      if (!categoryAttribute || !categoryAttribute.value) {
        return {
          content: [
            {
              type: "text",
              text: `No categories found for product with SKU: ${sku}`
            }
          ]
        };
      }
      
      // Parse category IDs (they might be in string format)
      let categoryIds = categoryAttribute.value;
      if (typeof categoryIds === 'string') {
        try {
          categoryIds = JSON.parse(categoryIds);
        } catch (e) {
          // If it's not valid JSON, split by comma
          categoryIds = categoryIds.split(',').map(id => id.trim());
        }
      }
      
      if (!Array.isArray(categoryIds)) {
        categoryIds = [categoryIds];
      }
      
      // Get category details for each ID
      const categoryPromises = categoryIds.map(id => 
        callMagentoApi(`/categories/${id}`)
          .catch(err => ({ id, error: err.message }))
      );
      
      const categories = await Promise.all(categoryPromises);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(categories, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching product categories: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get related products
server.tool(
  "get_related_products",
  "Get products related to a specific product by SKU",
  {
    sku: z.string().describe("The SKU (Stock Keeping Unit) of the product")
  },
  async ({ sku }) => {
    try {
      const relatedProducts = await callMagentoApi(`/products/${sku}/links/related`);
      
      if (!relatedProducts || relatedProducts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No related products found for SKU: ${sku}`
            }
          ]
        };
      }
      
      // Get full details for each related product
      const productPromises = relatedProducts.map(related => 
        callMagentoApi(`/products/${related.linked_product_sku}`)
          .then(product => formatProduct(product))
          .catch(err => ({ sku: related.linked_product_sku, error: err.message }))
      );
      
      const products = await Promise.all(productPromises);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(products, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching related products: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get product stock information
server.tool(
  "get_product_stock",
  "Get stock information for a product by SKU",
  {
    sku: z.string().describe("The SKU (Stock Keeping Unit) of the product")
  },
  async ({ sku }) => {
    try {
      const stockData = await callMagentoApi(`/stockItems/${sku}`);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(stockData, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching stock information: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get product attributes
server.tool(
  "get_product_attributes",
  "Get all attributes for a product by SKU",
  {
    sku: z.string().describe("The SKU (Stock Keeping Unit) of the product")
  },
  async ({ sku }) => {
    try {
      const productData = await callMagentoApi(`/products/${sku}`);
      
      // Extract and format attributes
      const attributes = {
        base_attributes: {
          id: productData.id,
          sku: productData.sku,
          name: productData.name,
          price: productData.price,
          status: productData.status,
          visibility: productData.visibility,
          type_id: productData.type_id
        },
        custom_attributes: {}
      };
      
      if (productData.custom_attributes && Array.isArray(productData.custom_attributes)) {
        productData.custom_attributes.forEach(attr => {
          attributes.custom_attributes[attr.attribute_code] = attr.value;
        });
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(attributes, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching product attributes: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get product by ID
server.tool(
  "get_product_by_id",
  "Get detailed information about a product by its ID",
  {
    id: z.number().describe("The ID of the product")
  },
  async ({ id }) => {
    try {
      // First we need to search for the product by ID to get its SKU
      const searchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=entity_id&` +
                            `searchCriteria[filter_groups][0][filters][0][value]=${id}&` +
                            `searchCriteria[filter_groups][0][filters][0][condition_type]=eq`;
      
      const searchResults = await callMagentoApi(`/products?${searchCriteria}`);
      
      if (!searchResults.items || searchResults.items.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No product found with ID: ${id}`
            }
          ]
        };
      }
      
      // Get the SKU from the search results
      const sku = searchResults.items[0].sku;
      
      // Now get the full product details using the SKU
      const productData = await callMagentoApi(`/products/${sku}`);
      const formattedProduct = formatProduct(productData);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedProduct, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching product: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Advanced product search
server.tool(
  "advanced_product_search",
  "Search for products with advanced filtering options",
  {
    field: z.string().describe("Field to search on (e.g., name, sku, price, status)"),
    value: z.string().describe("Value to search for"),
    condition_type: z.string().optional().describe("Condition type (eq, like, gt, lt, etc.). Default: eq"),
    page_size: z.number().optional().describe("Number of results per page (default: 10)"),
    current_page: z.number().optional().describe("Page number (default: 1)"),
    sort_field: z.string().optional().describe("Field to sort by (default: entity_id)"),
    sort_direction: z.string().optional().describe("Sort direction (ASC or DESC, default: DESC)")
  },
  async ({ field, value, condition_type = 'eq', page_size = 10, current_page = 1, sort_field = 'entity_id', sort_direction = 'DESC' }) => {
    try {
      // Build search criteria
      const searchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=${encodeURIComponent(field)}&` +
                            `searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(value)}&` +
                            `searchCriteria[filter_groups][0][filters][0][condition_type]=${encodeURIComponent(condition_type)}&` +
                            `searchCriteria[pageSize]=${page_size}&` +
                            `searchCriteria[currentPage]=${current_page}&` +
                            `searchCriteria[sortOrders][0][field]=${encodeURIComponent(sort_field)}&` +
                            `searchCriteria[sortOrders][0][direction]=${encodeURIComponent(sort_direction)}`;
      
      const productData = await callMagentoApi(`/products?${searchCriteria}`);
      const formattedResults = formatSearchResults(productData);
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedResults, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error performing advanced search: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Update product attribute
server.tool(
  "update_product_attribute",
  "Update a specific attribute of a product by SKU",
  {
    sku: z.string().describe("The SKU (Stock Keeping Unit) of the product"),
    attribute_code: z.string().describe("The code of the attribute to update (e.g., name, price, description, status, etc.)"),
    value: z.any().describe("The new value for the attribute")
  },
  async ({ sku, attribute_code, value }) => {
    try {
      // First, check if the product exists
      const productData = await callMagentoApi(`/products/${sku}`).catch(() => null);
      
      if (!productData) {
        return {
          content: [
            {
              type: "text",
              text: `Product with SKU '${sku}' not found`
            }
          ],
          isError: true
        };
      }
      
      // Prepare the update data with the correct structure
      // Magento 2 API requires a "product" wrapper object
      let updateData = {
        product: {}
      };
      
      // Determine if this is a standard attribute or custom attribute
      const isCustomAttribute = productData.custom_attributes && 
                               productData.custom_attributes.some(attr => attr.attribute_code === attribute_code);
      
      if (isCustomAttribute) {
        // For custom attributes, we need to use the custom_attributes array
        updateData.product.custom_attributes = [
          {
            attribute_code,
            value
          }
        ];
      } else {
        // For standard attributes, we set them directly on the product object
        updateData.product[attribute_code] = value;
      }
      
      // Make the API call to update the product
      const result = await callMagentoApi(`/products/${sku}`, 'PUT', updateData);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully updated '${attribute_code}' for product with SKU '${sku}'. Updated product: ${JSON.stringify(formatProduct(result), null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error updating product attribute: ${error.response?.data?.message || error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get order count
server.tool(
  "get_order_count",
  "Get the number of orders for a given date range",
  {
    date_range: z.string().describe("Date range expression (e.g., 'today', 'yesterday', 'last week', 'this month', 'YTD', or a specific date range like '2023-01-01 to 2023-01-31')"),
    status: z.string().optional().describe("Filter by order status (e.g., 'processing', 'complete', 'pending')")
  },
  async ({ date_range, status }) => {
    try {
      // Parse the date range expression
      const dateRange = parseDateExpression(date_range);
      
      // Build the search criteria for the date range
      let searchCriteria = buildDateRangeFilter('created_at', dateRange.startDate, dateRange.endDate);
      
      // Add status filter if provided
      if (status) {
        searchCriteria += `&searchCriteria[filter_groups][2][filters][0][field]=status&` +
                          `searchCriteria[filter_groups][2][filters][0][value]=${encodeURIComponent(status)}&` +
                          `searchCriteria[filter_groups][2][filters][0][condition_type]=eq`;
      }
      
      // Add pagination to get all results
      searchCriteria += `&searchCriteria[pageSize]=1&searchCriteria[currentPage]=1`;
      
      // Make the API call to get orders
      const ordersData = await callMagentoApi(`/orders?${searchCriteria}`);
      
      // Format the response
      const result = {
        query: {
          date_range: dateRange.description,
          status: status || 'All',
          period: {
            start_date: format(dateRange.startDate, 'yyyy-MM-dd'),
            end_date: format(dateRange.endDate, 'yyyy-MM-dd')
          }
        },
        result: {
          order_count: ordersData.total_count || 0
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching order count: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: Get customer ordered products by email
server.tool(
  "get_customer_ordered_products_by_email",
  "Get all ordered products for a customer by email address",
  {
    email: z.string().email().describe("The email address of the customer")
  },
  async ({ email }) => {
    try {
      // Step 1: Find the customer by email
      const searchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=email&` +
                            `searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(email)}&` +
                            `searchCriteria[filter_groups][0][filters][0][condition_type]=eq`;
      
      const customersData = await callMagentoApi(`/customers/search?${searchCriteria}`);
      
      if (!customersData.items || customersData.items.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No customer found with email: ${email}`
            }
          ]
        };
      }
      
      const customer = customersData.items[0];
      
      // Step 2: Get the customer's orders
      const orderSearchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=customer_email&` +
                                 `searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(email)}&` +
                                 `searchCriteria[filter_groups][0][filters][0][condition_type]=eq`;
      
      // Fetch all orders for the customer using the helper function
      const allCustomerOrders = await fetchAllPages('/orders', orderSearchCriteria);
      
      if (!allCustomerOrders || allCustomerOrders.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No orders found for customer with email: ${email}`
            }
          ]
        };
      }
      
      // Step 3: Extract and format the ordered products
      const orderedProducts = [];
      const productSkus = new Set();
      
      // First, collect all unique product SKUs from all orders
      allCustomerOrders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            if (item.sku) {
              productSkus.add(item.sku);
            }
          });
        }
      });
      
      // Get detailed product information for each SKU
      const productPromises = Array.from(productSkus).map(sku => 
        callMagentoApi(`/products/${sku}`)
          .then(product => formatProduct(product))
          .catch(err => ({ sku, error: err.message }))
      );
      
      const productDetails = await Promise.all(productPromises);
      
      // Create a map of SKU to product details for easy lookup
      const productMap = {};
      productDetails.forEach(product => {
        if (product.sku) {
          productMap[product.sku] = product;
        }
      });
      
      // Format the result with order information and product details
      const result = {
        customer: {
          id: customer.id,
          email: customer.email,
          firstname: customer.firstname,
          lastname: customer.lastname
        },
        orders: allCustomerOrders.map(order => ({
          order_id: order.entity_id,
          increment_id: order.increment_id,
          created_at: order.created_at,
          status: order.status,
          total: order.grand_total,
          items: order.items.map(item => {
            const productDetail = productMap[item.sku] || {};
            return {
              sku: item.sku,
              name: item.name,
              price: item.price,
              qty_ordered: item.qty_ordered,
              product_details: productDetail
            };
          })
        }))
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching customer ordered products: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

require('./sales-tools').registerSalesTools(server, {
  callMagentoApi, fetchAllPages, parseDateExpression, buildDateRangeFilter, normalizeCountry
});

// Start the MCP server with stdio transport
async function main() {
  try {
    console.error('Starting Magento MCP Server...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Magento MCP Server running on stdio');
  } catch (error) {
    console.error('Error starting MCP server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
