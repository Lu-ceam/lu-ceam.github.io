import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { siteConfig } from '../config';
import { getPublishedPosts, postPath } from '../lib/posts';

export async function GET(context: APIContext) {
	if (!context.site) {
		throw new Error('astro.config 里缺少 site');
	}

	const posts = await getPublishedPosts();
	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		site: context.site,
		trailingSlash: true,
		customData: '<language>zh-cn</language>',
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.date,
			description: post.data.description ?? post.data.title,
			link: postPath(post.id),
			categories: [...post.data.tags],
		})),
	});
}
