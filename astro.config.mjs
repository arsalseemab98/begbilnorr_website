// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    isr: {
      expiration: 60,
      exclude: ['/api/cars', '/api/upload', '/api/newsletter-send', '/api/newsletter-subscribe', '/api/contact', '/api/admin-auth', '/admin', '/bilar'],
    },
  }),
  site: 'https://begbilnorr.se',
});
