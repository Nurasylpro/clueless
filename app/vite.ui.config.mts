// `npm run ui`: the overlay UI alone in a normal browser, driven by mock data
// (src/renderer/src/mock). Handy for building UI and visuals without Electron or an API key.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), tailwindcss()],
  server: { port: 5199 }
})
