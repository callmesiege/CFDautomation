import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For a GitHub project page the app is served from https://<user>.github.io/<repo>/,
// so assets need that prefix. The deploy workflow sets VITE_BASE to "/<repo>/";
// local dev and the preview build stay at "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})
