import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Accept the names Supabase's "Connect" dialog shows (NEXT_PUBLIC_*) as well as VITE_*.
const PREFIXES = ['VITE_', 'NEXT_PUBLIC_']

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), PREFIXES)
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Shows up in the Vercel build log, so it's easy to tell whether the keys reached the build.
  console.log(`[splitly] Supabase URL: ${url ? 'set' : 'MISSING'} · key: ${key ? 'set' : 'MISSING'} → ${url && key ? 'shared mode' : 'local-only mode'}`)
  return {
    plugins: [react()],
    envPrefix: PREFIXES,
    define: {
      __SUPABASE_URL__: JSON.stringify((url || '').trim()),
      __SUPABASE_KEY__: JSON.stringify((key || '').trim()),
    },
  }
})
