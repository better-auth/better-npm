import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { registryFetch } from "@/lib/admin";

export const metadata: Metadata = {
	title: "Packages — better-npm",
};

interface PackageSummary {
	package_name: string;
	install_count: number;
	version_count: number;
	last_installed: number;
	first_installed: number;
	status: "tracked" | "blocked" | "untracked";
}

interface PackagesResponse {
	packages: PackageSummary[];
	total: number;
	limit: number;
	offset: number;
}

type SortKey = "name" | "installs" | "versions" | "recent";
type SortOrder = "asc" | "desc";

const DEFAULT_SORT: SortKey = "recent";
const DEFAULT_ORDER: SortOrder = "desc";

function buildHref(params: {
	page?: number;
	per?: number;
	search?: string;
	sort?: SortKey;
	order?: SortOrder;
}) {
	const qs = new URLSearchParams();
	if (params.page && params.page > 1) qs.set("page", String(params.page));
	if (params.per && params.per !== 30) qs.set("per", String(params.per));
	if (params.search) qs.set("q", params.search);
	if (params.sort && params.sort !== DEFAULT_SORT) qs.set("sort", params.sort);
	if (params.order && params.order !== DEFAULT_ORDER)
		qs.set("order", params.order);
	const s = qs.toString();
	return `/dashboard/activity${s ? `?${s}` : ""}`;
}

function nextSort(
	column: SortKey,
	currentSort: SortKey,
	currentOrder: SortOrder,
): { sort: SortKey; order: SortOrder } {
	if (column === currentSort) {
		return { sort: column, order: currentOrder === "desc" ? "asc" : "desc" };
	}
	return { sort: column, order: column === "name" ? "asc" : "desc" };
}

export default async function PackagesPage({
	searchParams,
}: {
	searchParams: Promise<{
		page?: string;
		per?: string;
		q?: string;
		sort?: string;
		order?: string;
	}>;
}) {
	const h = await headers();
	const session = await auth.api.getSession({ headers: h });
	const email = session?.user?.email;
	const params = await searchParams;
	const perPage = [20, 30, 50].includes(Number(params.per))
		? Number(params.per)
		: 30;
	const page = Math.max(1, Number(params.page || 1));
	const offset = (page - 1) * perPage;
	const search = params.q?.trim() || "";
	const sort: SortKey = (
		["name", "installs", "versions", "recent"] as const
	).includes(params.sort as any)
		? (params.sort as SortKey)
		: DEFAULT_SORT;
	const order: SortOrder = params.order === "asc" ? "asc" : DEFAULT_ORDER;

	const data: PackagesResponse = email
		? await registryFetch(
				`/api/internal/user/packages?email=${encodeURIComponent(email)}&limit=${perPage}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}&sort=${sort}&order=${order}`,
			).catch(() => ({ packages: [], total: 0, limit: perPage, offset }))
		: { packages: [], total: 0, limit: perPage, offset };

	const totalPages = Math.max(1, Math.ceil(data.total / perPage));
	const safePage = Math.min(page, totalPages);

	if (!data.packages.length && safePage === 1 && !search) {
		return (
			<div className="rounded border border-dashed border-foreground/[0.08] px-6 py-16 text-center">
				<p className="text-sm text-foreground/30">No packages installed yet</p>
				<p className="mx-auto mt-2 max-w-xl text-sm text-foreground/20">
					This list is built from tarball installs recorded by the registry.
					Each install must send your registry auth token (see{" "}
					<code className="font-mono text-foreground/30">:_authToken</code> in{" "}
					<code className="font-mono text-foreground/30">.npmrc</code>) so it
					can be tied to your account. The dashboard must use the same registry
					database as the one your CLI installs hit.
				</p>
				<p className="mt-4 text-xs text-foreground/20">
					Run{" "}
					<code className="font-mono text-foreground/30">
						npx @better-npm/cli
					</code>{" "}
					to configure the registry and token.
				</p>
			</div>
		);
	}

	const columns: {
		key: SortKey;
		label: string;
		align: "left" | "right";
	}[] = [
		{ key: "name", label: "Package", align: "left" },
		{ key: "installs", label: "Installs", align: "right" },
		{ key: "versions", label: "Versions", align: "right" },
	];

	return (
		<div className="h-full flex flex-col">
			<div className="flex-shrink-0 flex flex-wrap items-center gap-3 mb-4">
				<form
					action="/dashboard/activity"
					method="GET"
					className="flex-1 min-w-[200px]"
				>
					<input
						type="text"
						name="q"
						placeholder="Search packages…"
						defaultValue={search}
						className="w-full px-3 py-2 text-sm bg-transparent border border-foreground/[0.1] rounded placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
					/>
				</form>
				<p className="text-xs text-foreground/30 font-mono tabular-nums whitespace-nowrap">
					{data.total.toLocaleString()} package{data.total !== 1 ? "s" : ""}
				</p>
			</div>

			{data.packages.length === 0 && search ? (
				<div className="rounded border border-dashed border-foreground/[0.08] px-6 py-12 text-center">
					<p className="text-sm text-foreground/30">
						No packages matching &ldquo;{search}&rdquo;
					</p>
				</div>
			) : (
				<div className="flex-1 min-h-0 border border-foreground/[0.08] rounded overflow-auto thin-scrollbar">
					<table className="w-full text-sm min-w-[540px]">
						<thead className="sticky top-0 z-10 bg-background">
							<tr className="border-b border-foreground/[0.06] bg-foreground/[0.02]">
								{columns.map((col) => {
									const ns = nextSort(col.key, sort, order);
									const isActive = sort === col.key;
									return (
										<th
											key={col.key}
											className={`${col.align === "right" ? "text-right" : "text-left"} px-4 py-2.5 font-normal`}
										>
											<a
												href={buildHref({
													page: 1,
													per: perPage,
													search,
													sort: ns.sort,
													order: ns.order,
												})}
												className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
													isActive
														? "text-foreground/60"
														: "text-foreground/30 hover:text-foreground/50"
												}`}
											>
												{col.label}
												<SortIndicator
													active={isActive}
													direction={isActive ? order : null}
												/>
											</a>
										</th>
									);
								})}
								<th className="text-left px-4 py-2.5 font-normal">
									<span className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
										Status
									</span>
								</th>
								<th className="text-left px-4 py-2.5 font-normal">
									<a
										href={buildHref({
											page: 1,
											per: perPage,
											search,
											...nextSort("recent", sort, order),
										})}
										className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
											sort === "recent"
												? "text-foreground/60"
												: "text-foreground/30 hover:text-foreground/50"
										}`}
									>
										Last installed
										<SortIndicator
											active={sort === "recent"}
											direction={sort === "recent" ? order : null}
										/>
									</a>
								</th>
							</tr>
						</thead>
						<tbody>
							{data.packages.map((pkg) => (
								<tr
									key={pkg.package_name}
									className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02] transition-colors"
								>
									<td className="px-4 py-3">
										<Link
											href={`/dashboard/activity/pkg?name=${encodeURIComponent(pkg.package_name)}`}
											className="text-[13px] font-mono hover:underline underline-offset-4 decoration-foreground/20"
										>
											{pkg.package_name}
										</Link>
									</td>
									<td className="px-4 py-3 text-right text-[13px] font-mono tabular-nums text-foreground/50">
										{pkg.install_count.toLocaleString()}
									</td>
									<td className="px-4 py-3 text-right text-[13px] font-mono tabular-nums text-foreground/50">
										{pkg.version_count}
									</td>
									<td className="px-4 py-3">
										<TrackingBadge status={pkg.status} />
									</td>
									<td className="px-4 py-3 text-[13px] text-foreground/30">
										{formatRelative(pkg.last_installed)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{totalPages > 1 && (
				<div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 mt-3">
					<p className="text-xs text-foreground/25 font-mono tabular-nums">
						Page {safePage} of {totalPages}
					</p>
					<Pagination
						current={safePage}
						total={totalPages}
						perPage={perPage}
						search={search}
						sort={sort}
						order={order}
					/>
				</div>
			)}
		</div>
	);
}

function SortIndicator({
	active,
	direction,
}: {
	active: boolean;
	direction: SortOrder | null;
}) {
	if (!active || !direction) {
		return <span className="text-foreground/15 text-[9px]">↕</span>;
	}
	return <span className="text-[9px]">{direction === "asc" ? "↑" : "↓"}</span>;
}

function Pagination({
	current,
	total,
	perPage,
	search,
	sort,
	order,
}: {
	current: number;
	total: number;
	perPage: number;
	search: string;
	sort: SortKey;
	order: SortOrder;
}) {
	const pages = getPageNumbers(current, total);
	return (
		<div className="flex items-center gap-1.5">
			<a
				href={
					current > 1
						? buildHref({
								page: current - 1,
								per: perPage,
								search,
								sort,
								order,
							})
						: undefined
				}
				aria-disabled={current <= 1}
				className={`px-2 py-1 rounded text-xs transition-colors ${
					current > 1
						? "text-foreground/50 hover:text-foreground hover:bg-foreground/[0.05]"
						: "text-foreground/15 pointer-events-none"
				}`}
			>
				← Prev
			</a>
			{pages.map((p, i) =>
				p === "..." ? (
					<span key={`e-${i}`} className="text-foreground/20 px-1 text-xs">
						…
					</span>
				) : (
					<a
						key={p}
						href={buildHref({ page: p, per: perPage, search, sort, order })}
						className={`min-w-[28px] text-center px-1.5 py-1 rounded text-xs transition-colors ${
							p === current
								? "bg-foreground/[0.08] text-foreground font-medium"
								: "text-foreground/40 hover:text-foreground hover:bg-foreground/[0.04]"
						}`}
					>
						{p}
					</a>
				),
			)}
			<a
				href={
					current < total
						? buildHref({
								page: current + 1,
								per: perPage,
								search,
								sort,
								order,
							})
						: undefined
				}
				aria-disabled={current >= total}
				className={`px-2 py-1 rounded text-xs transition-colors ${
					current < total
						? "text-foreground/50 hover:text-foreground hover:bg-foreground/[0.05]"
						: "text-foreground/15 pointer-events-none"
				}`}
			>
				Next →
			</a>
		</div>
	);
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	const pages: (number | "...")[] = [1];
	if (current > 3) pages.push("...");
	for (
		let i = Math.max(2, current - 1);
		i <= Math.min(total - 1, current + 1);
		i++
	)
		pages.push(i);
	if (current < total - 2) pages.push("...");
	pages.push(total);
	return pages;
}

function TrackingBadge({ status }: { status: string }) {
	const config: Record<string, { label: string; classes: string }> = {
		tracked: {
			label: "reviewed",
			classes: "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/15",
		},
		blocked: {
			label: "blocked",
			classes: "bg-red-500/10 text-red-400/80 border-red-500/15",
		},
		untracked: {
			label: "unreviewed",
			classes:
				"bg-foreground/[0.04] text-foreground/30 border-foreground/[0.08]",
		},
	};
	const c = config[status] || config.untracked;
	return (
		<span
			className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border ${c.classes}`}
		>
			{c.label}
		</span>
	);
}

function formatRelative(ms: number): string {
	const diff = Date.now() - ms;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
