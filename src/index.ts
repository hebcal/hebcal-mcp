import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SseServerTransport } from "./sse-transport.js";
import express from "express";
import { z } from "zod";
import { HDate, getYahrzeitHD } from "@hebcal/hdate";
import { Sedra, ParshaEvent, getHolidaysOnDate, flags } from "@hebcal/core";
import dayjs from "dayjs";

const server = new McpServer({
  name: "hebcal",
  version: "1.0.0",
});

const reIsoDate = /^\d\d\d\d-\d\d-\d\d/;

/**
 * Parse a string YYYY-MM-DD and return Date
 */
function isoDateStringToDate(str: string): Date {
  if (!reIsoDate.test(str)) {
    throw new RangeError(`Date does not match format YYYY-MM-DD: ${str}`);
  }
  const yy = parseInt(str, 10);
  const mm = parseInt(str.substring(5, 7), 10);
  const dd = parseInt(str.substring(8, 10), 10);
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  return dt;
}

server.tool(
  "convert-gregorian-to-hebrew",
  "Converts a Gregorian (civil) date to a Hebrew date (Jewish calendar)",
  {
    date: z.string().describe('Gregorian date to convert'),
  },
  async ({ date }) => {
    let dt;
    try {
      dt = isoDateStringToDate(date);
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Error parsing date: ${date}`,
          }
        ]
      }
    }
    const hd = new HDate(dt);
    const results = [
      `Hebrew year: ${hd.getFullYear()}`,
      `Hebrew month: ${hd.getMonthName()}`,
      `Day of Hebrew month: ${hd.getDate()}`,
      `Date in Hebrew letters: ${hd.renderGematriya()}`,
      `Is leap year: ${hd.isLeapYear()}`,
    ];
    return {
      content: [
        {
          type: "text",
          text: results.join('\n'),
        },
      ],
    };
  },
);

server.tool(
  "convert-hebrew-to-gregorian",
  "Converts a Hebrew date to a Gregorian (civil) date",
  {
    day: z.number().int().min(1).max(30).describe('Hebrew day of month'),
    month: z.string().describe('Hebrew month name transliterated, like Elul or Tishrei'),
    year: z.number().int().min(1).max(9999).describe('Hebrew year'),
  },
  async ({ day, month, year }) => {
    let monthNum: number;
    try {
      monthNum = HDate.monthFromName(month);
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Cannot interpret "${month}" as a Hebrew month name.`,
          },
        ],
      };
    }

    const hd = new HDate(day, monthNum, year);
    const d = dayjs(hd.greg());
    return {
      content: [
        {
          type: "text",
//          text: `Gregorian year: ${d.year()}\nGregorian month: ${d.format('MMMM')}\nDay of month: ${d.date()}`,
          text: d.format('YYYY-MM-DD'),
        },
      ],
    };
  },
);

server.tool(
  "yahrzeit",
  "Calculates the Yahrzeit, the anniversary of the day of death of a loved one, according to the Hebrew calendar",
  {
    date: z.string().describe('Gregorian date of death'),
    afterSunset: z.boolean().describe('after sunset')
  },
  async ({ date, afterSunset }) => {
    let dt;
    try {
      dt = isoDateStringToDate(date);
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Error parsing date: ${date}`,
          }
        ]
      }
    }

    let origHd = new HDate(dt);
    if (afterSunset) {
      origHd = origHd.next();
    }
    const origHyear = origHd.getFullYear();

    const now = new HDate();
    const startYear = now.getFullYear();
    const endYear = startYear + 3;
    const hdates = [];
    for (let hyear = startYear; hyear <= endYear; hyear++) {
      const anniversary = getYahrzeitHD(hyear, origHd);
      if (typeof anniversary !== 'undefined') {
        const hd = new HDate(anniversary);
        hdates.push(hd);
      }
    }
    if (hdates.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No yahrzeit available for: ${date} in Hebrew years ${startYear}-${endYear}`,
          }
        ]
      }
    }

    let results: string[] = [];
    for (const hd of hdates) {
      const hyear = hd.getFullYear();
      const yearNumber = hyear - origHyear;
      const d = dayjs(hd.greg());
      const summary = [
        `Anniversary number: ${yearNumber}`,
        `Gregorian Date of Yahrzeit: ${d.format('YYYY-MM-DD')}`,
        `Hebrew year: ${hyear}`,
        `Hebrew month: ${hd.getMonthName()}`,
        `Day of Hebrew month: ${hd.getDate()}`,
        `Date in Hebrew letters: ${hd.renderGematriya()}`,
      ];
      results = results.concat(...summary, '');
    }
    return {
      content: [
        {
          type: "text",
          text: results.join('\n'),
        },
      ],
    };
  },
);

server.tool(
  "torah-portion",
  "Calculates the weekly Torah portion (also called parashat haShavua)",
  {
    date: z.string().describe('Gregorian date'),
    il: z.boolean().describe('True if in Israel, false for Diaspora')
  },
  async ({ date, il }) => {
    let dt;
    try {
      dt = isoDateStringToDate(date);
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: `Error parsing date: ${date}`,
          }
        ]
      }
    }

    const hd = new HDate(dt);
    const sedra = new Sedra(hd.getFullYear(), il);
    const parsha = sedra.lookup(hd);
    const parshaName = parsha.chag ? parsha.parsha[0] :
      `Parashat ${parsha.parsha.join('-')}`;
    const lines: string[] = [];
    lines.push(`Torah portion: ${parshaName}`);
    if (!parsha.chag) {
      const pe = new ParshaEvent(parsha.hdate, parsha.parsha, il, parsha.num);
      lines.push(`Name in Hebrew: ${pe.render('he')}`);
      const holidays = getHolidaysOnDate(parsha.hdate, il) || [];
      const special = holidays.filter((ev) => ev.getFlags() & flags.SPECIAL_SHABBAT);
      if (special.length) {
        lines.push(`Special Shabbat: ${special[0].render('en')}`);
      }
    }
    const d = dayjs(parsha.hdate.greg());
    lines.push(`Date read: ${d.format('YYYY-MM-DD')}`);
    return {
      content: [
        {
          type: "text",
          text: lines.join('\n'),
        }
      ]
    };
  },
);

async function main() {
  const transportMode = process.env.MCP_TRANSPORT || (process.argv.includes("--sse") ? "sse" : "stdio");
  const port = process.env.PORT || 3000;

  if (transportMode === "sse") {
    const app = express();
    app.get("/mcp", (req, res) => {
      const transport = new SseServerTransport(req, res);
      server.connect(transport);
      console.error(`Hebcal MCP Server connected via SSE on /mcp`);

      // Keep the connection alive by sending a comment every 20 seconds
      const keepAliveInterval = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(keepAliveInterval);
          return;
        }
        res.write(": keepalive\n\n");
      }, 20000);

      req.on("close", () => {
        clearInterval(keepAliveInterval);
        console.error("SSE connection closed by client");
        transport.close();
      });
    });

    // Temporary test route for SSE
    app.get("/test-tool", async (_req, res) => {
      const testRequestId = `test-${Date.now()}`;
      const callToolRequest = {
        jsonrpc: "2.0",
        id: testRequestId,
        method: "callTool",
        params: {
          name: "convert-gregorian-to-hebrew",
          arguments: {
            date: "2024-03-10", // Example date
          },
        },
      };

      try {
        // Accessing the internal 'server' instance of McpServer to use its receiveMessage.
        // This simulates an incoming request from a client.
        // The McpServer should then process this and send the response via any connected transport (like SSE).
        // @ts-expect-error McpServer.server is the underlying JSONRPCServer instance and is not meant for public use
        server.server.receiveMessage(callToolRequest, {
          // Mock any 'extra' context if needed by receiveMessage or subsequent handlers
          // For SseServerTransport, it doesn't use 'extra' for incoming messages processing
        });

        res.json({ status: `Test tool request '${testRequestId}' sent to McpServer. Check SSE stream for response.` });
      } catch (error) {
        console.error("Error in /test-tool:", error);
        if (error instanceof Error) {
          res.status(500).send(`Error sending test tool request: ${error.message}`);
        } else {
          res.status(500).send("Unknown error sending test tool request");
        }
      }
    });

    app.listen(port, () => {
      console.error(`Hebcal MCP Server with SSE running on http://localhost:${port}/mcp`);
      console.error(`SSE test tool endpoint available at http://localhost:${port}/test-tool`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Hebcal MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
