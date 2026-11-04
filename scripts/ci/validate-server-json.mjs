// Validates server.json against the official MCP registry schema (ajv, draft-07). Used by
// scripts/publish-all.sh --dry-run in place of `mcp-publisher publish` (no network login, no CLI
// download needed just to check the file is well-formed).
//   node scripts/ci/validate-server-json.mjs <schema.json> <server.json>
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';

const [schemaPath, dataPath] = process.argv.slice(2);
if (!schemaPath || !dataPath) throw new Error('usage: node validate-server-json.mjs <schema.json> <server.json>');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const ok = validate(data);
if (ok) {
  console.log(`${dataPath} is valid against ${schema.$id}`);
  process.exit(0);
} else {
  console.error(`${dataPath} FAILED schema validation:`);
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}
