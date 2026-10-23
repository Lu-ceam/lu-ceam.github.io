/** Format a frontmatter date as a calendar day, independent of the build timezone. */
export function formatDate(date: Date): string {
	return new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(date);
}

export function dateTimeAttr(date: Date): string {
	return date.toISOString().slice(0, 10);
}
