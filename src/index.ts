import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HDate } from "@hebcal/hdate";
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hebcal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
