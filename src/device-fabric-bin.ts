#!/usr/bin/env bun
import { deviceFabricCli } from "./device-fabric.ts";

try {
  process.exit(await deviceFabricCli(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
