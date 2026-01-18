import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                // rewrite: (path) => path.replace(/^\/api/, ''), // Backend expects /api/ now? No, we mapped /api/* to main.py
            },
        },
    },
})
