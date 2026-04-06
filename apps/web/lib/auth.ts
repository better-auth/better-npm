import { betterAuth } from "better-auth";
import { admin, bearer, deviceAuthorization } from "better-auth/plugins";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { dash } from "@better-auth/infra";

export const auth = betterAuth({
  database: {
    dialect: new LibsqlDialect({
      url: process.env.TURSO_DB_URL!,
      authToken: process.env.TURSO_TOKEN!,
    }),
    type: "sqlite",
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  plugins: [
    admin(),
    bearer(),
    deviceAuthorization({
      verificationUri: "/auth/device",
    }),
    dash({
      activityTracking: {
        enabled: true,
      },
    }),
  ],
  trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
});