import express, { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getServer } from './app.js';
import { makeLogger } from './logger.js';
import pinoHttp from 'pino-http';

const app = express();

const logDir = process.env.NODE_ENV === 'production' ? '/var/log/hebcal' : '.';
const logger = makeLogger(logDir);
app.use(pinoHttp({
  logger: logger,
  autoLogging: false,
}));

logger.info('Express server: starting up');

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

async function notAllowed(req: Request, res: Response) {
  req.log.info(`Received ${req.method} MCP request`);
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: `Method ${req.method} not allowed`
    },
    id: null
  }));
}

app.get('/mcp', notAllowed);
app.delete('/mcp', notAllowed);

app.get('/ping', (req, res) => {
  // will return 404 if it's not there
  res.sendFile('/var/www/html/ping');
});

// Start the server
const port = process.env.NODE_PORT || 8080;
app.listen(port, () => {
  const msg = `express listening on port ${port}`;
  logger.info(msg);
  console.log(msg);
});
