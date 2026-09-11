import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/** 独立桌宠运行时构建（导出 Windows 便携包时打包进产物）。 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out-pet/main',
      rollupOptions: {
        input: 'src/pet/main.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out-pet/preload',
      rollupOptions: {
        input: {
          petwin: 'src/preload/petwin.ts',
          sizeControl: 'src/preload/size-control.ts',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out-pet/renderer',
      rollupOptions: {
        input: {
          pet: 'src/renderer/pet.html',
          sizeControl: 'src/renderer/size-control.html',
        },
      },
    },
    plugins: [react()],
  },
});
