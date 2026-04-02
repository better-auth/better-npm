#!/usr/bin/env node
import { init } from "./commands/init.js";
import { logout } from "./commands/logout.js";
import { status } from "./commands/status.js";

const command = process.argv[2];

switch (command) {
  case "logout":
    logout();
    break;
  case "status":
    status();
    break;
  case "help":
    console.log(`
  better-npm — curated npm registry

  Usage:
    npx better-npm          Set up better-npm (sign in or create account)
    npx better-npm status   Check subscription status
    npx better-npm logout   Remove token from .npmrc
`);
    break;
  default:
    init();
}
