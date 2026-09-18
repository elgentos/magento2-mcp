const { z, id, paginationSchema } = require('./common');

const DOCS = 'https://elgentos-b2b-suite-api-docs.vercel.app/';
const MODULE_MISSING = `This Magento instance does not have the Elgentos B2B Suite company module (Elgentos_CompanyAccounts): the /V1/company routes do not exist. Company tools cannot be used here. See ${DOCS} for the module and its API.`;
const TOKEN_REJECTED = 'Magento rejected the API token when reading companies. The token can be expired, or the integration can lack the Elgentos_CompanyAccounts::companies_view resource. Company tools need companies_view to read and companies_edit to write.';

const companyStatus = z.enum(['pending', 'active', 'inactive', 'declined', 'cancelled']);
const autoAssign = z.object({
  enabled: z.boolean().describe('Whether new customers with a matching email domain are assigned to this company'),
  domains: z.array(z.string().min(1)).describe('Email domains without the @, for example acme.com')
}).describe('Domain based auto-assignment; stored by Magento as the JSON string auto_assign_config');
const text = (description, min = 1) => z.string().min(min).describe(description);
const companyFields = {
  name: text('Company name'),
  coc_number: text('Chamber of Commerce number (KVK)'),
  vat_number: text('VAT registration number, for example NL123456789B01'),
  street: text('Street address'),
  postcode: text('Postal code'),
  city: text('City'),
  country_id: z.string().regex(/^[A-Za-z]{2}$/).describe('Two-letter ISO country code, for example NL'),
  email: z.string().email().describe('Company contact email'),
  status: companyStatus.describe('Company status; Magento defaults new companies to pending'),
  telephone: text('Phone number'),
  representative: text('Contact person name'),
  auto_assign: autoAssign
};
const required = ['name', 'coc_number', 'vat_number', 'street', 'postcode', 'city', 'country_id', 'email'];
const createSchema = Object.fromEntries(Object.entries(companyFields)
  .map(([field, schema]) => [field, required.includes(field) ? schema : schema.optional()]));
const changeSchema = z.object(Object.fromEntries(Object.entries(companyFields)
  .map(([field, schema]) => [field, schema.optional()]))).describe('Only the fields to change; every other field keeps its current value');

function parseAutoAssign(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try { return JSON.parse(raw); } catch { return { parse_error: 'auto_assign_config is not valid JSON', raw }; }
}

// Magento stores auto-assignment as a JSON string; expose it parsed as well as raw.
function present(company) {
  if (!company || typeof company !== 'object') return company;
  return { ...company, ...('auto_assign_config' in company ? { auto_assign: parseAutoAssign(company.auto_assign_config) } : {}) };
}

function payload(fields) {
  const { auto_assign, ...company } = fields;
  if (auto_assign !== undefined) company.auto_assign_config = JSON.stringify(auto_assign);
  return company;
}

function registerCompanyTools(ctx) {
  let probe = null;
  async function checkSupport() {
    try {
      const response = await ctx.api('/company/search?searchCriteria[pageSize]=1&searchCriteria[currentPage]=1');
      if (!response || !Array.isArray(response.items)) return { available: false, reason: 'unexpected_response', message: MODULE_MISSING };
      return { available: true, reason: null, message: 'The Elgentos B2B Suite company API is available and readable with this token.' };
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) return { available: false, reason: 'module_missing', message: MODULE_MISSING };
      if (status === 401 || status === 403) return { available: false, reason: 'token_rejected', message: TOKEN_REJECTED };
      throw error;
    }
  }
  function support() {
    // Cache the answer per server process, but retry after a transient failure.
    probe ??= checkSupport().catch(error => { probe = null; throw error; });
    return probe;
  }
  async function requireSupport() {
    const result = await support();
    if (!result.available) throw new Error(result.message);
  }
  // Only call this after requireSupport, so a 404 means a missing record and not a missing module.
  async function entity(endpoint, missing, method = 'GET', data = null) {
    await requireSupport();
    try { return await ctx.api(endpoint, method, data); }
    catch (error) {
      const status = error.response?.status;
      if (status === 404) throw new Error(missing);
      if (status === 401 || status === 403) throw new Error(`Magento answered ${status} for ${method} ${endpoint}. ${endpoint.startsWith('/company') ? TOKEN_REJECTED : 'The integration lacks the permission for this route.'}`);
      throw error;
    }
  }
  async function optionalEntity(endpoint, note) {
    await requireSupport();
    try { return await ctx.api(endpoint); }
    catch (error) {
      const status = error.response?.status;
      if (status === 404) return { missing: note };
      if (status === 401 || status === 403) throw new Error(`Magento answered ${status} for ${endpoint}. ${TOKEN_REJECTED}`);
      throw error;
    }
  }

  ctx.register('get_company_support', `Check whether this Magento instance has the Elgentos B2B Suite company module (Elgentos_CompanyAccounts) and whether the API token can read companies. Call this first when company tools fail, because not every Magento instance has the B2B suite. Docs: ${DOCS}`,
    {}, async () => ({ result: await support() }));

  ctx.register('get_companies', 'Search B2B companies by name, status, KVK/VAT number, email, city or country. Returns paginated company records including address, contact data and parsed domain auto-assignment. Requires the Elgentos B2B Suite company module.', {
    name: z.string().min(1).optional().describe('Partial company name match'),
    status: companyStatus.optional().describe('Exact company status; omitted includes all statuses'),
    coc_number: z.string().min(1).optional().describe('Exact Chamber of Commerce number (KVK)'),
    vat_number: z.string().min(1).optional().describe('Exact VAT number'),
    email: z.string().min(1).optional().describe('Exact company contact email'),
    city: z.string().min(1).optional().describe('Exact city'),
    country: z.string().min(1).optional().describe('Country code or name, for example NL or The Netherlands'),
    ...paginationSchema
  }, async args => {
    await requireSupport();
    const companies = await ctx.all('/company/search', ctx.criteria({}, 'created_at', [
      ['name', args.name === undefined ? undefined : `%${args.name}%`, 'like'],
      ['status', args.status], ['coc_number', args.coc_number], ['vat_number', args.vat_number],
      ['email', args.email], ['city', args.city],
      ['country_id', args.country === undefined ? undefined : ctx.normalizeCountry(args.country).join(','), 'in']
    ], 'company_id'));
    const result = ctx.paged(companies.map(present), args, 'companies');
    return { query: args, result };
  });

  ctx.register('get_company', 'Get one B2B company by company ID, or the company a customer belongs to. A customer without a company returns company=null instead of an error. Requires the Elgentos B2B Suite company module.', {
    company_id: id().optional().describe('Company ID'),
    customer_id: id().optional().describe('Magento customer ID; returns the company this customer belongs to')
  }, async args => {
    if ((args.company_id !== undefined) === (args.customer_id !== undefined)) throw new Error('Specify exactly one of company_id or customer_id');
    if (args.company_id !== undefined) {
      return { result: present(await entity(`/company/${args.company_id}`, `Company ${args.company_id} not found`)) };
    }
    const company = await optionalEntity(`/company/customer/${args.customer_id}`, 'This customer is not assigned to a company.');
    return { result: company.missing
      ? { customer_id: args.customer_id, company: null, note: company.missing }
      : { customer_id: args.customer_id, company: present(company) } };
  });

  ctx.register('create_company', 'Create a B2B company. Magento sets the status to pending unless a status is given. Requires the Elgentos B2B Suite company module and the companies_edit permission.',
    createSchema, async args => {
      const company = await entity('/company', 'The company create route was not found', 'POST', { company: payload(args) });
      return { result: present(company) };
    });

  ctx.register('update_company', 'Update selected fields of a B2B company. Reads the company first and sends the merged record, so fields that are left out keep their current value. Requires the Elgentos B2B Suite company module and the companies_edit permission.', {
    company_id: id(), changes: changeSchema
  }, async args => {
    const changes = payload(args.changes);
    if (Object.keys(changes).length === 0) throw new Error('Specify at least one field in changes');
    const existing = await entity(`/company/${args.company_id}`, `Company ${args.company_id} not found`);
    const { company_id: _ignored, ...current } = existing;
    const updated = await entity(`/company/${args.company_id}`, `Company ${args.company_id} not found`, 'PUT', { company: { ...current, ...changes } });
    return { result: present(updated), changed_fields: Object.keys(changes), previous: present(existing) };
  });

  ctx.register('delete_company', 'Delete a B2B company permanently. This cannot be undone and it unassigns the customers that belong to the company. Reads the company first and returns the deleted record so it can be recreated. Requires the Elgentos B2B Suite company module and the companies_delete permission.', {
    company_id: id(),
    confirm: z.literal(true).describe('Must be true. Confirms that this company is deleted permanently.')
  }, async args => {
    const existing = await entity(`/company/${args.company_id}`, `Company ${args.company_id} not found`);
    await entity(`/company/${args.company_id}`, `Company ${args.company_id} not found`, 'DELETE');
    return { result: { company_id: args.company_id, deleted: true, deleted_company: present(existing) },
      warning: 'The company is gone. Recreate it with create_company from deleted_company if this was a mistake; the new company gets a new company_id.' };
  });

  ctx.register('get_company_customer', 'Get the company assignment of a Magento customer, including the role within the company. A customer without an assignment returns assignment=null instead of an error. Requires the Elgentos B2B Suite company module.', {
    customer_id: id()
  }, async args => {
    const assignment = await optionalEntity(`/company-customer/customer/${args.customer_id}`, 'This customer is not assigned to a company.');
    return { result: assignment.missing
      ? { customer_id: args.customer_id, assignment: null, note: assignment.missing }
      : { customer_id: args.customer_id, assignment } };
  });

  ctx.register('assign_customer_to_company', 'Assign a Magento customer to a B2B company, with an optional role. Verifies the company first and reports any assignment the customer already has, because one customer belongs to one company at a time. Requires the Elgentos B2B Suite company module and the companies_edit permission.', {
    company_id: id().describe('Company to assign the customer to'),
    customer_id: id().describe('Magento customer ID'),
    role_id: id().optional().describe('Role within the company, for example the admin role')
  }, async args => {
    const company = await entity(`/company/${args.company_id}`, `Company ${args.company_id} not found`);
    const previous = await optionalEntity(`/company-customer/customer/${args.customer_id}`, 'This customer had no company assignment.');
    const assignment = await entity('/company-customer', 'The company-customer route was not found', 'POST', {
      companyCustomer: { company_id: args.company_id, customer_id: args.customer_id, ...(args.role_id === undefined ? {} : { role_id: args.role_id }) }
    });
    const moved = !previous.missing && Number(previous.company_id) !== args.company_id;
    return { result: { assignment, company: present(company), previous_assignment: previous.missing ? null : previous },
      ...(moved ? { warning: `This customer belonged to company ${previous.company_id} and now belongs to company ${args.company_id}.` } : {}) };
  });

  ctx.register('set_company_prices', 'Replace all company specific price tiers of one product. The list you send becomes the complete set of tiers for that SKU: tiers that are left out are removed, and an empty list removes every company price for the SKU. The B2B API has no read route for current company prices, so you cannot read the tiers back before replacing them. Requires the Elgentos B2B Suite company module and the Magento_Catalog::products permission.', {
    sku: z.string().min(1).describe('Product SKU'),
    prices: z.array(z.object({
      company_id: id().describe('Company this price applies to'),
      quantity: z.number().positive().describe('Minimum quantity for this tier'),
      price: z.number().nonnegative().describe('Price for this tier in the store currency')
    })).describe('The complete list of tiers for this SKU; an empty list removes all company prices'),
    confirm: z.literal(true).describe('Must be true. Confirms that all existing company price tiers for this SKU are replaced by this list.')
  }, async args => {
    await entity(`/products/${encodeURIComponent(args.sku)}`, `Product ${args.sku} not found`);
    await entity(`/company-pricing/${encodeURIComponent(args.sku)}`, `Product ${args.sku} not found`, 'POST', { sku: args.sku, companyPrices: args.prices });
    return { result: { sku: args.sku, ...await ctx.baseCurrency(), tier_count: args.prices.length, prices: args.prices, replaced_all_tiers: true },
      calculation: 'Company prices are quantity tiers per company and product. Magento applies the tier with the highest quantity that the ordered quantity reaches.' };
  });
}

module.exports = { registerCompanyTools, present, payload, parseAutoAssign, companyStatus, MODULE_MISSING, TOKEN_REJECTED };
