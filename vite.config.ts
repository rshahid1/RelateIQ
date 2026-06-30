import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // GDELT has no CORS headers — proxy it so company news works without any API key.
      // In production, replicate with a rewrite rule on your host (Vercel/Netlify/nginx).
      '/gdelt': {
        target: 'https://api.gdeltproject.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gdelt/, '/api/v2'),
      },
      '/gnews': {
        target: 'https://news.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gnews/, ''),
      },
      '/yfinance': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yfinance/, ''),
      },
    },
  },
})
