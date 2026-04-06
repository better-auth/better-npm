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
  bnpm — vetted npm registry

  Usage:
    bnpm            Configure better-npm as your registry
    bnpm status     Check connection status
    bnpm logout     Remove better-npm from .npmrc
`);
    break;
  default:
    init();
}
