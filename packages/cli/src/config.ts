import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

const DEV = process.env.BETTER_NPM_DEV === "1";

const REGISTRY_HOST =
	process.env.BETTER_NPM_REGISTRY ||
	(DEV ? "localhost:8787" : "registry.better-npm.dev");
const REGISTRY_URL =
	process.env.BETTER_NPM_REGISTRY_URL ||
	(DEV ? "http://localhost:8787" : `https://${REGISTRY_HOST}`);
const WEB_URL =
	process.env.BETTER_NPM_WEB_URL ||
	(DEV ? "http://localhost:3001" : "https://better-npm.com");

export { REGISTRY_HOST, REGISTRY_URL, WEB_URL };

function globalNpmrcPath() {
	return join(homedir(), ".npmrc");
}

function localNpmrcPath() {
	return resolve(process.cwd(), ".npmrc");
}

function npmrcPath(scope: "global" | "local") {
	return scope === "global" ? globalNpmrcPath() : localNpmrcPath();
}

export function getExistingToken(): string | null {
	for (const path of [localNpmrcPath(), globalNpmrcPath()]) {
		if (!existsSync(path)) continue;
		const content = readFileSync(path, "utf-8");
		const match = content.match(
			new RegExp(`//${escapeRegex(REGISTRY_HOST)}/:_authToken=(.+)`),
		);
		if (match?.[1]) return match[1].trim();
	}
	return null;
}

export function writeRegistry(scope: "global" | "local") {
	const path = npmrcPath(scope);
	let content = "";

	if (existsSync(path)) {
		content = readFileSync(path, "utf-8");
		content = content
			.split("\n")
			.filter((line) => !line.includes("registry=" + REGISTRY_URL))
			.join("\n")
			.trim();
	}

	const lines = [content, `registry=${REGISTRY_URL}/`]
		.filter(Boolean)
		.join("\n");

	writeFileSync(path, lines + "\n");
}

export function writeToken(token: string, scope: "global" | "local") {
	const path = npmrcPath(scope);
	let content = "";

	if (existsSync(path)) {
		content = readFileSync(path, "utf-8");
		content = content
			.split("\n")
			.filter(
				(line) =>
					!line.includes(`//${REGISTRY_HOST}/:_authToken=`) &&
					!line.includes("registry=" + REGISTRY_URL),
			)
			.join("\n")
			.trim();
	}

	const lines = [
		content,
		`registry=${REGISTRY_URL}/`,
		`//${REGISTRY_HOST}/:_authToken=${token}`,
	]
		.filter(Boolean)
		.join("\n");

	writeFileSync(path, lines + "\n");
}

export function isRegistryConfigured(): boolean {
	for (const path of [localNpmrcPath(), globalNpmrcPath()]) {
		if (!existsSync(path)) continue;
		const content = readFileSync(path, "utf-8");
		if (content.includes("registry=" + REGISTRY_URL)) return true;
	}
	return false;
}

export function removeToken() {
	let removed = false;
	for (const path of [localNpmrcPath(), globalNpmrcPath()]) {
		if (!existsSync(path)) continue;
		const content = readFileSync(path, "utf-8");
		if (!content.includes(`//${REGISTRY_HOST}/:_authToken=`)) continue;

		const filtered = content
			.split("\n")
			.filter((line) => !line.includes(`//${REGISTRY_HOST}/:_authToken=`))
			.join("\n")
			.trim();

		writeFileSync(path, filtered ? filtered + "\n" : "");
		removed = true;
	}
	return removed;
}

export function removeRegistry() {
	let removed = false;
	for (const path of [localNpmrcPath(), globalNpmrcPath()]) {
		if (!existsSync(path)) continue;
		const content = readFileSync(path, "utf-8");
		if (!content.includes(REGISTRY_HOST) && !content.includes(REGISTRY_URL)) {
			continue;
		}

		const filtered = content
			.split("\n")
			.filter(
				(line) =>
					!line.includes(`//${REGISTRY_HOST}/:_authToken=`) &&
					!line.includes("registry=" + REGISTRY_URL),
			)
			.join("\n")
			.trim();

		writeFileSync(path, filtered ? filtered + "\n" : "");
		removed = true;
	}
	return removed;
}

export function ensureGitignore(): boolean {
	const gitignorePath = resolve(process.cwd(), ".gitignore");

	if (existsSync(gitignorePath)) {
		const content = readFileSync(gitignorePath, "utf-8");
		const lines = content.split("\n").map((l) => l.trim());
		if (lines.includes(".npmrc")) return false;
		writeFileSync(gitignorePath, content.trimEnd() + "\n.npmrc\n");
		return true;
	}

	writeFileSync(gitignorePath, ".npmrc\n");
	return true;
}

function escapeRegex(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
