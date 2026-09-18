const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

// Two properties of one tool that share a zod instance make zod-to-json-schema emit
// {"$ref": "#/properties/<other field>"} for the second one. mcpo only resolves references that
// live in $defs, so it raises inside create_dynamic_endpoints and every tool registered after the
// first offender loses its HTTP route. The MCP server itself stays healthy, which is why this hid
// for so long. Build each schema from its own instance; merchant/common.js exports id as a factory.
test('no tool input schema contains a $ref', async t => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, '../mcp-server.js')], stderr: 'pipe',
    env: { MAGENTO_API_TOKEN: 'mock', MAGENTO_BASE_URL: 'http://127.0.0.1:1/rest/V1', TZ: 'UTC' } });
  const client = new Client({ name: 'schema-tests', version: '1' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  transport.stderr.on('data', () => {});

  const { tools } = await client.listTools();
  assert.ok(tools.length >= 51, `expected every tool to be registered, got ${tools.length}`);
  const offenders = tools.filter(tool => JSON.stringify(tool.inputSchema).includes('$ref'));
  assert.deepEqual(offenders.map(tool => tool.name), [],
    'these schemas carry a $ref and would truncate the tool list behind mcpo; give each field its own schema instance');
});
