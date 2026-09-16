import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    env: { TZ: 'Asia/Shanghai' },
  },
});
