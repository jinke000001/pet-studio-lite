import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(projectRoot, 'src', 'workbench', 'renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.join(projectRoot, '.workbench-dist'),
    emptyOutDir: true,
  },
});
