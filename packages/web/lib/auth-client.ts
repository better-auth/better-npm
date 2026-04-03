import { createAuthClient } from "better-auth/react";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
	plugins: [deviceAuthorizationClient()],
});

export const { signIn, signOut, useSession } = authClient;
