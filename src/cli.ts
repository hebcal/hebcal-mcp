import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getServer } from './app.js';

async function main() {
  const transport = new StdioServerTransport();
  const server = getServer();
  await server.connect(transport);
  console.error("Hebcal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
