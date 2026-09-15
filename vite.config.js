import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    env: { TZ: 'Asia/Shanghai' },
  },
});
