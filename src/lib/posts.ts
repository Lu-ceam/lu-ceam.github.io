import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedPosts(): Promise<BlogPost[]> {
	const posts = await getCollection('blog', ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	return posts.sort((a, b) => {
		const byDate = b.data.date.getTime() - a.data.date.getTime();
		if (byDate !== 0) return byDate;
		return a.data.title.localeCompare(b.data.title, 'zh-CN');
	});
}

export function postPath(id: string): string {
	const encoded = id
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	return `/blog/${encoded}/`;
}

export function tagPath(tag: string): string {
	return `/tags/${encodeURIComponent(tag)}/`;
}

export function getTags(posts: BlogPost[]): { tag: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => a.tag.localeCompare(b.tag, 'zh-CN') || b.count - a.count);
}
