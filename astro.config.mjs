// @ts-check
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

/** Record images are written while pages render, after Vite has copied `public/`. */
function copyRecordMedia() {
	return {
		name: 'copy-record-media',
		hooks: {
			'astro:build:done': async ({ dir }) => {
				const from = join(process.cwd(), 'public', 'records-media');
				const to = join(dir.pathname, 'records-media');
				await cp(from, to, { recursive: true });
			},
		},
	};
}

/**
 * KaTeX's stylesheet ships `font-display: block`, which hides formulas until
 * the font files finish downloading. Swap keeps the math visible.
 * @returns {import('vite').Plugin}
 */
function katexFontDisplay() {
	return {
		name: 'katex-font-display',
		enforce: 'pre',
		transform(code, id) {
			if (id.includes('katex') && id.includes('.css')) {
				return code.replaceAll('font-display:block', 'font-display:swap');
			}
		},
	};
}

export default defineConfig({
	site: 'https://lu-ceam.github.io',
	trailingSlash: 'always',
	integrations: [
		copyRecordMedia(),
		mdx(),
		sitemap({
			filter: (page) => !page.includes('/404'),
		}),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
		shikiConfig: {
			themes: {
				light: 'github-light',
				dark: 'github-dark',
			},
			defaultColor: 'light-dark()',
		},
	},
	vite: {
		plugins: [katexFontDisplay()],
	},
});
