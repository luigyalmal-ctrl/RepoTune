export function printSuccess(msg: string): void {
	console.log(`✓ ${msg}`);
}
export function printError(msg: string): void {
	console.error(`✗ ${msg}`);
}
export function printWarn(msg: string): void {
	console.warn(`⚠ ${msg}`);
}
export function printInfo(msg: string): void {
	console.log(`  ${msg}`);
}
