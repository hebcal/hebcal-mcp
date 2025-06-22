import express, { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getServer } from './app.js';
import { makeLogger, logMemoryUsage } from './logger.js';
import pinoHttp from 'pino-http';

const app = express();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const logger = makeLogger(logDir);
app.use(pinoHttp({
  logger: logger,
  autoLogging: false,
}));

logger.info('Express server: starting up');
logMemoryUsage(logger);
setInterval(() => {
  logMemoryUsage(logger);
}, 30000);

app.use(express.json());

// reuse MCP server
const server = getServer(); 

app.post('/mcp', async (req: Request, res: Response) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.
  
  try {
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      transport.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    req.log.info({ body: req.body });
  } catch (error) {
    req.log.error(error, 'Error handling MCP request');
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  req.log.info('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

app.delete('/mcp', async (req: Request, res: Response) => {
  req.log.info('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

// Start the server
const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  const msg = `express listening on port ${port}`;
  logger.info(msg);
  console.log(msg);
});
