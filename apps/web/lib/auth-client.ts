import { createAuthClient } from "better-auth/react";
import { adminClient, deviceAuthorizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  plugins: [adminClient(), deviceAuthorizationClient()],
});

export const { signIn, signOut, useSession } = authClient;
