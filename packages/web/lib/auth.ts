import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { BETTER_NPM_CLI_CLIENT_ID } from "./cli-constants";

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

export const auth = betterAuth({
	baseURL,
	database: new Database("better-npm.db"),
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
	},
	trustedOrigins: [baseURL],
	plugins: [
		deviceAuthorization({
			verificationUri: `${baseURL}/auth/device`,
			validateClient: (clientId) => clientId === BETTER_NPM_CLI_CLIENT_ID,
		}),
	],
});
