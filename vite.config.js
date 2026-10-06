import { defineConfig } from 'vite';

export default defineConfig(({command})=>({
  base: './',
  ...(command==='build'?{define:{
    'import.meta.env.VITE_READING_JUDGMENT_POLICY':JSON.stringify(process.env.VITE_READING_JUDGMENT_POLICY??'6'),
    'import.meta.env.VITE_READING_BASIS_POLICY':JSON.stringify(process.env.VITE_READING_BASIS_POLICY??'4'),
    'import.meta.env.VITE_READING_STRICT_TRANSPORT':JSON.stringify(process.env.VITE_READING_STRICT_TRANSPORT??'1'),
  }}:{}),
  build: { target: 'es2020' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    env: { TZ: 'Asia/Shanghai' },
  },
}));
