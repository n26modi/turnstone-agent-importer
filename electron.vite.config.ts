import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      {
        name: 'renderer-content-security-policy',
        transformIndexHtml(_html, context) {
          const content = [
            "default-src 'self'",
            context.server ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            context.server
              ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"
              : "connect-src 'none'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; ')
          return [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content },
              injectTo: 'head-prepend',
            },
          ]
        },
      },
    ],
  },
})
