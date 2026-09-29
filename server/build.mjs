// Bundles the server (main thread + world worker) into server/dist/.
import { build } from 'rolldown';
for (const name of ['server', 'world']) {
  await build({ input: `server/${name}.ts`, platform: 'node', external: ['ws'], output: { file: `server/dist/${name}.mjs`, format: 'esm' }, logLevel: 'warn' });
}
console.log('server built: server/dist/server.mjs + world.mjs');
