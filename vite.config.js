import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'SUPABASE_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ['./src/editor/EditorShell.jsx'],
          tree: ['./src/tree/FamilyChartView.jsx'],
        },
      },
    },
  },
});
