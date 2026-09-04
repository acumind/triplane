/**
 * The entrypoint. Exists so that `mcp-stdio.ts` can be imported by tests without turning
 * the importing process into an MCP server — starting the loop is a choice made here.
 */
import { serve } from "./mcp-stdio.ts";

serve();
