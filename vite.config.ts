import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  server: { port: 5173 },
  build: { target: 'es2022' },
  // every build gets a stamp; online worlds only let players on the newest build play together
  define: { __BUILD__: JSON.stringify(Date.now()) },
});
