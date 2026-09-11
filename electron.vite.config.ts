import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/** 制作台（工作室）构建。 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          studio: 'src/preload/studio.ts',
          petwin: 'src/preload/petwin.ts',
          sizeControl: 'src/preload/size-control.ts',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: 'src/renderer/index.html',
          pet: 'src/renderer/pet.html',
          sizeControl: 'src/renderer/size-control.html',
        },
      },
    },
    plugins: [react()],
  },
});
