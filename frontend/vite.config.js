import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: true, // bind 0.0.0.0 so the Vite dev server is reachable from outside the container
        watch: {
            usePolling: true, // file-change events from a Windows host bind mount aren't always forwarded reliably
        },
    },
});