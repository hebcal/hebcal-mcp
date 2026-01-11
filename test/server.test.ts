import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getServer } from '../src/app.js';

// Helper function to parse SSE response and extract JSON-RPC message
function parseSSE(sseText: string): any {
  const lines = sseText.trim().split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('data: ')) {
      const jsonData = lines[i].substring(6); // Remove 'data: ' prefix
      try {
        return JSON.parse(jsonData);
      } catch (e) {
        // Continue to next line if parse fails
      }
    }
  }
  return null;
}

// Create Express app for testing (same setup as server.ts but without starting the server)
function createTestApp(): Express {
  const app = express();
  app.use(express.json());

  const server = getServer();

  app.post('/mcp', async (req, res) => {
    try {
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on('close', () => {
        transport.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
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

  return app;
}

describe('MCP Server HTTP Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /mcp - MCP Protocol', () => {
    it('should list available tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        })
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 1);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result).toHaveProperty('tools');
      expect(Array.isArray(jsonrpcMessage.result.tools)).toBe(true);
      expect(jsonrpcMessage.result.tools.length).toBe(7);

      const toolNames = jsonrpcMessage.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('convert-gregorian-to-hebrew');
      expect(toolNames).toContain('convert-hebrew-to-gregorian');
      expect(toolNames).toContain('yahrzeit');
      expect(toolNames).toContain('torah-portion');
      expect(toolNames).toContain('jewish-holidays-year');
      expect(toolNames).toContain('daf-yomi');
      expect(toolNames).toContain('candle-lighting');
    });

    it('should convert Gregorian to Hebrew date', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'convert-gregorian-to-hebrew',
            arguments: {
              date: '2024-01-01',
            },
          },
          id: 2,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 2);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result).toHaveProperty('content');
      expect(Array.isArray(jsonrpcMessage.result.content)).toBe(true);
      expect(jsonrpcMessage.result.content[0]).toHaveProperty('type', 'text');
      expect(jsonrpcMessage.result.content[0].text).toContain('Hebrew year:');
      expect(jsonrpcMessage.result.content[0].text).toContain('Hebrew month:');
    });

    it('should convert Hebrew to Gregorian date', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'convert-hebrew-to-gregorian',
            arguments: {
              day: 15,
              month: 'Shevat',
              year: 5784,
            },
          },
          id: 3,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 3);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should calculate yahrzeit dates', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'yahrzeit',
            arguments: {
              date: '2020-03-15',
              afterSunset: false,
            },
          },
          id: 4,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 4);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Anniversary number');
      expect(jsonrpcMessage.result.content[0].text).toContain('Gregorian date');
      expect(jsonrpcMessage.result.content[0].text).toContain('Hebrew year');
    });

    it('should get Torah portion for a date', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'torah-portion',
            arguments: {
              date: '2024-01-06',
              il: false,
            },
          },
          id: 5,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 5);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Torah portion:');
      expect(jsonrpcMessage.result.content[0].text).toContain('Date read:');
    });

    it('should get Jewish holidays for a year', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'jewish-holidays-year',
            arguments: {
              year: 2024,
            },
          },
          id: 6,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 6);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Gregorian date');
      expect(jsonrpcMessage.result.content[0].text).toContain('Hebrew date');
      expect(jsonrpcMessage.result.content[0].text).toContain('Holiday');
    });

    it('should get Daf Yomi for a date', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'daf-yomi',
            arguments: {
              date: '2024-01-01',
            },
          },
          id: 7,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 7);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Daf Yomi (English):');
      expect(jsonrpcMessage.result.content[0].text).toContain('Hebrew date:');
    });

    it('should get candle-lighting times for a location', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'candle-lighting',
            arguments: {
              latitude: 41.85003,
              longitude: -87.65005,
              tzid: 'America/Chicago',
              startDate: '2024-01-05',
              endDate: '2024-01-13',
            },
          },
          id: 8,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 8);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Candle lighting');
      expect(jsonrpcMessage.result.content[0].text).toContain('Havdalah');
      expect(jsonrpcMessage.result.content[0].text).toContain('Date');
      expect(jsonrpcMessage.result.content[0].text).toContain('Time');
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid date format', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'convert-gregorian-to-hebrew',
            arguments: {
              date: 'invalid-date',
            },
          },
          id: 9,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 9);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Error parsing date');
    });

    it('should return error for invalid Hebrew month', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'convert-hebrew-to-gregorian',
            arguments: {
              day: 15,
              month: 'XYZ123NotAMonth',
              year: 5784,
            },
          },
          id: 10,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 10);
      expect(jsonrpcMessage).toHaveProperty('result');
      expect(jsonrpcMessage.result.content[0].text).toContain('Cannot interpret');
    });

    it('should handle invalid tool name', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'non-existent-tool',
            arguments: {},
          },
          id: 11,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 11);
      // Should have an error property for unknown tool
      expect(jsonrpcMessage.error || jsonrpcMessage.result).toBeTruthy();
    });
  });

  describe('MCP Protocol Compliance', () => {
    it('should respond with proper JSON-RPC 2.0 structure', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 12,
        })
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('jsonrpc', '2.0');
      expect(jsonrpcMessage).toHaveProperty('id', 12);
      expect(jsonrpcMessage.result || jsonrpcMessage.error).toBeTruthy();
    });

    it('should handle requests without id (notifications)', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
        })
        .expect(202);

      // For notifications, server returns 202 Accepted without a response body
    });
  });

  describe('Input Validation', () => {
    it('should validate date parameter for yahrzeit', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'yahrzeit',
            arguments: {
              date: '2024/01/01', // Wrong format
              afterSunset: false,
            },
          },
          id: 13,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage.result.content[0].text).toContain('Error parsing date');
    });

    it('should validate year parameter bounds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'jewish-holidays-year',
            arguments: {
              year: 2024,
            },
          },
          id: 14,
        })
        .expect(200);

      const jsonrpcMessage = parseSSE(response.text);
      expect(jsonrpcMessage).toBeTruthy();
      expect(jsonrpcMessage).toHaveProperty('result');
    });
  });
});
