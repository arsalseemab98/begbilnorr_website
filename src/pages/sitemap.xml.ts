export const prerender = true;

import type { APIRoute } from 'astro';
import { supabase } from '../lib/supabase';

export const GET: APIRoute = async () => {
  const site = 'https://begbilnorr.se';
  const now = new Date().toISOString().split('T')[0];

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/bilar', priority: '0.9', changefreq: 'daily' },
    { url: '/begagnade-bilar-lulea', priority: '0.9', changefreq: 'daily' },
    { url: '/begagnade-bilar-boden', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-pitea', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-kalix', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-alvsbyn', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-gallivare', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-kiruna', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-haparanda', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-skelleftea', priority: '0.8', changefreq: 'daily' },
    { url: '/begagnade-bilar-umea', priority: '0.8', changefreq: 'daily' },
    { url: '/kontakt', priority: '0.7', changefreq: 'monthly' },
    { url: '/om-oss', priority: '0.6', changefreq: 'monthly' },
    { url: '/finansiering', priority: '0.7', changefreq: 'monthly' },
    { url: '/salj-bil', priority: '0.7', changefreq: 'monthly' },
    { url: '/swish', priority: '0.6', changefreq: 'monthly' },
    { url: '/hoja-swish-grans', priority: '0.6', changefreq: 'monthly' },
    { url: '/integritetspolicy', priority: '0.4', changefreq: 'yearly' },
    { url: '/anvandarvillkor', priority: '0.4', changefreq: 'yearly' },
  ];

  const { data: cars } = await supabase
    .from('cars')
    .select('slug, updated_at, brand')
    .eq('is_active', true)
    .eq('is_sold', false);

  const carPages = (cars || []).map((car: { slug: string; updated_at: string }) => ({
    url: `/bilar/${car.slug}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: car.updated_at ? car.updated_at.split('T')[0] : now,
  }));

  // Brand-specific landing pages
  const brands = [...new Set((cars || []).map((c: { brand: string }) => c.brand))];
  const brandPages = brands.map((brand: string) => ({
    url: `/begagnade-bilar-lulea/${brand.toLowerCase()}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: now,
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (p) => `  <url>
    <loc>${site}${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
${carPages
  .map(
    (p: { url: string; lastmod: string; changefreq: string; priority: string }) => `  <url>
    <loc>${site}${p.url}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
${brandPages
  .map(
    (p: { url: string; priority: string; changefreq: string; lastmod: string }) => `  <url>
    <loc>${site}${p.url}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
