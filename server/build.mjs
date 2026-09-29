// Bundles the relay: server/dist/relay-node.mjs (Node) — the Cloudflare worker is built by wrangler.
import { build } from 'rolldown';
await build({ input: 'server/relay-node.ts', platform: 'node', external: ['ws'], output: { file: 'server/dist/relay-node.mjs', format: 'esm' }, logLevel: 'warn' });
console.log('relay built: server/dist/relay-node.mjs');
