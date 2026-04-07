import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: "better-npm.",
			url: "/",
		},
		themeSwitch: {
			enabled: false,
		},
	};
}
