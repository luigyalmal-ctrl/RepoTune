import type { AgentId, GeneratedFile } from "@repotune/schemas";

/** Extract generated content between managed-block markers. Returns null if markers are missing. */
export function extractBlockContent(
	text: string,
	agentId: AgentId,
): string | null {
	const start = `<!-- repotune:start ${agentId} -->`;
	const end = `<!-- repotune:end ${agentId} -->`;
	const si = text.indexOf(start);
	if (si === -1) return null;
	const afterStart = si + start.length;
	const ei = text.indexOf(end, afterStart);
	if (ei === -1) return null;
	let inner = text.slice(afterStart, ei);
	if (inner.startsWith("\r\n")) inner = inner.slice(2);
	else if (inner.startsWith("\n")) inner = inner.slice(1);
	if (inner.endsWith("\r\n")) inner = inner.slice(0, -2);
	else if (inner.endsWith("\n")) inner = inner.slice(0, -1);
	return inner;
}

export function render(
	file: GeneratedFile,
	currentContent: string | null,
): string {
	const { strategy, content } = file;

	if (strategy === "create" || strategy === "overwrite") return content;
	if (strategy === "skip") return currentContent ?? "";

	// managed-block — schema validates managedBlockMarker when strategy is managed-block
	const m = file.managedBlockMarker;
	if (!m) return content;
	const block = `${m.start}\n${content}\n${m.end}`;

	if (currentContent === null) return block;

	const si = currentContent.indexOf(m.start);
	const ei = currentContent.indexOf(m.end);

	if (si === -1 || ei === -1) return `${currentContent}\n${block}`;

	return (
		currentContent.slice(0, si) +
		block +
		currentContent.slice(ei + m.end.length)
	);
}
