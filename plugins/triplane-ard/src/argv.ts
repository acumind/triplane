import { ArdError } from "./errors.ts";
import { WAIVERS } from "./discover.ts";
import type { Waiver } from "./types.ts";

/**
 * Argument parsing, kept out of `cli.ts` because that file is an entrypoint: importing it to
 * test the parser would run the CLI. Same rule as `serve.ts` — entrypoints do not export
 * logic, they invoke it.
 *
 * Flags are stripped from the WHOLE argv before positionals are read. Reading `argv[3]` as
 * the domain first meant `--allow x discover` silently took "--allow" as the domain.
 */
export function parseArgv(argv: string[]) {
  const allow: Waiver[] = [];
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--allow") {
      const v = argv[++i];
      if (!v) throw new ArdError("ARD_BAD_INPUT", "--allow needs a value.", { known: WAIVERS });
      if (!WAIVERS.includes(v as Waiver)) {
        throw new ArdError("ARD_BAD_INPUT", `Unknown waiver ${JSON.stringify(v)}.`, { known: WAIVERS });
      }
      allow.push(v as Waiver);
    } else {
      positional.push(argv[i]);
    }
  }

  const [cmd, domain, ...args] = positional;
  return { allow, cmd, domain, args };
}
