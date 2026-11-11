import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['assets/aistudio/BC86C239-606D-46FC-BEB7-28C9FB20248E_0c95af46.png'],
        manifest: {
          id: '/',
          name: 'Shucadea Manager — Shucadea Hardware',
          short_name: 'Shucadea',
          description: 'Production Business Management System for Shucadea Hardware',
          theme_color: '#071D3A',
          background_color: '#071D3A',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/assets/aistudio/BC86C239-606D-46FC-BEB7-28C9FB20248E_0c95af46.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/aistudio/BC86C239-606D-46FC-BEB7-28C9FB20248E_0c95af46.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
