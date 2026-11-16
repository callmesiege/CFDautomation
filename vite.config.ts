import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project pages are served from https://<user>.github.io/<repo>/, so the
// "pages" build mode prefixes asset URLs with the repository name. Dev and the
// default build stay at "/". Override with VITE_BASE if the repo is renamed.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE ?? (mode === 'pages' ? '/CFDautomation/' : '/'),
}))
