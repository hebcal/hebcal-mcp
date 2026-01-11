import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HDate, getYahrzeitHD } from "@hebcal/hdate";
import { HebrewCalendar, Sedra, ParshaEvent, getHolidaysOnDate, flags, DailyLearning, Location, Event, TimedEvent } from "@hebcal/core";
import { getLeyningForParshaHaShavua } from '@hebcal/leyning';
import '@hebcal/learning';
import dayjs from "dayjs";

const reIsoDate = /^\d\d\d\d-\d\d-\d\d/;

function errorCard(message: string): any {
  return {
    content: [
      {
        type: "text",
        text: message,
      }
    ]
  }
}

/**
 * Parse a string YYYY-MM-DD and return Date
 */
export function isoDateStringToDate(str: string): Date {
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

export function doYahrzeit(dt: Date, afterSunset: boolean): string[] {
  let origHd = new HDate(dt);
  if (afterSunset) {
    origHd = origHd.next();
  }
  const origHyear = origHd.getFullYear();

  const now = new HDate();
  const nowYear = now.getFullYear();
  const startYear = nowYear - 2;
  const endYear = nowYear + 20;
  const hdates = [];
  for (let hyear = startYear; hyear <= endYear; hyear++) {
    const anniversary = getYahrzeitHD(hyear, origHd);
    if (anniversary) {
      const hd = new HDate(anniversary);
      hdates.push(hd);
    }
  }

  const lines: string[] = [
    '| Anniversary number | Gregorian date | Hebrew year | Hebrew day and month | Date in Hebrew letters |',
    '| ---- | ---- | ---- | ---- | ---- |',
  ];
  for (const hd of hdates) {
    const hyear = hd.getFullYear();
    const yearNumber = hyear - origHyear;
    const d = dayjs(hd.greg());
    lines.push(`| ${yearNumber} | ${d.format('YYYY-MM-DD')} | ${hyear} | ${hd.render('en', false)} | ${hd.renderGematriya()} |`);
  }
  return lines;
}

export function torahPortion(dt: Date, il: boolean): string[] {
  const hd = new HDate(dt);
  const sedra = new Sedra(hd.getFullYear(), il);
  const parsha = sedra.lookup(hd);
  const parshaName = parsha.chag ? parsha.parsha[0] :
    `Parashat ${parsha.parsha.join('-')}`;
  const lines: string[] = [];
  lines.push(`Torah portion: ${parshaName}`);
  if (!parsha.chag) {
    const pe = new ParshaEvent(parsha);
    lines.push(`Name in Hebrew: ${pe.render('he')}`);
    const reading = getLeyningForParshaHaShavua(pe, pe.p.il);
    lines.push(`Reading: ${reading.summary}`);
    const holidays = getHolidaysOnDate(parsha.hdate, il) || [];
    const special = holidays.filter((ev) => ev.getFlags() & flags.SPECIAL_SHABBAT);
    if (special.length) {
      lines.push(`Special Shabbat: ${special[0].render('en')}`);
    }
  }
  const d = dayjs(parsha.hdate.greg());
  lines.push(`Date read: ${d.format('YYYY-MM-DD')}`);
  return lines;
}

export function candleLighting(
  latitude: number,
  longitude: number,
  tzid: string,
  startDate: string,
  endDate: string
): string[] {
  const il = tzid === 'Asia/Jerusalem';
  const location = new Location(latitude, longitude, il, tzid);

  const start = isoDateStringToDate(startDate);
  const end = isoDateStringToDate(endDate);

  const events = HebrewCalendar.calendar({
    candlelighting: true,
    location: location,
    start: start,
    end: end,
  });

  const lines: string[] = [
    '| Date | Time | Type | Associated Event |',
    '| ---- | ---- | ---- | ---- |',
  ];

  for (const ev of events) {
    const desc = ev.getDesc();
    if (desc === 'Candle lighting' || desc === 'Havdalah') {
      const timedEv = ev as TimedEvent;
      const hd = timedEv.getDate();
      const d = dayjs(hd.greg());
      const timeStr = timedEv.eventTimeStr || '';

      let associated = '';
      if (timedEv.linkedEvent) {
        associated = timedEv.linkedEvent.render('en');
      }

      lines.push(`| ${d.format('YYYY-MM-DD')} | ${timeStr} | ${desc} | ${associated} |`);
    }
  }

  return lines;
}

export function getServer(): McpServer {
  const server = new McpServer({
    name: "hebcal",
    version: "1.0.1",
  });

  server.registerTool(
    "convert-gregorian-to-hebrew",
    {
      description: "Converts a Gregorian (civil) date to a Hebrew date (Jewish calendar)",
      inputSchema: {
        date: z.string().describe('Gregorian date (in yyyy-MM-dd format) to convert'),
      },
    },
    async function ({ date }) {
      let dt;
      try {
        dt = isoDateStringToDate(date);
      } catch {
        return errorCard(`Error parsing date: ${date}`);
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

  server.registerTool(
    "convert-hebrew-to-gregorian",
    {
      description: "Converts a Hebrew date to a Gregorian (civil) date",
      inputSchema: {
        day: z.number().int().min(1).max(30).describe('Hebrew day of month'),
        month: z.string().describe('Hebrew month name transliterated, like Elul or Tishrei'),
        year: z.number().int().min(1).max(9999).describe('Hebrew year'),
      },
    },
    async ({ day, month, year }) => {
      let monthNum: number;
      try {
        monthNum = HDate.monthFromName(month);
      } catch {
        return errorCard(`Cannot interpret "${month}" as a Hebrew month name`);
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

  server.registerTool(
    "yahrzeit",
    {
      description: "Calculates the Yahrzeit, the anniversary of the day of death of a loved one, according to the Hebrew calendar for a specified date",
      inputSchema: {
        date: z.string().describe('Gregorian date of death (in yyyy-MM-dd format)'),
        afterSunset: z.boolean().describe('after sunset')
      },
    },
    async ({ date, afterSunset }) => {
      let dt;
      try {
        dt = isoDateStringToDate(date);
      } catch {
        return errorCard(`Error parsing date: ${date}`);
      }

      let results: string[] = doYahrzeit(dt, afterSunset);
      if (results.length === 0) {
        const now = new HDate();
        const startYear = now.getFullYear();
        const endYear = startYear + 3;
        return errorCard(`No yahrzeit available for: ${date} in Hebrew years ${startYear}-${endYear}`);
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

  server.registerTool(
    "torah-portion",
    {
      description: "Calculates the weekly Torah portion (also called parashat haShavua) for a specified date",
      inputSchema: {
        date: z.string().describe('Gregorian date in yyyy-MM-dd format'),
        il: z.boolean().describe('True if in Israel, false for Diaspora')
      },
    },
    async ({ date, il }) => {
      let dt;
      try {
        dt = isoDateStringToDate(date);
      } catch {
        return errorCard(`Error parsing date: ${date}`);
      }

      const lines = torahPortion(dt, il);
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

  server.registerTool(
    "jewish-holidays-year",
    {
      description: "Calculates a list of all Jewish holidays during a Gregorian (civil) year",
      inputSchema: {
        year: z.number().int().min(1).max(9999).describe('Gregorian year'),
      },
    },
    async ({ year }) => {
      const events = HebrewCalendar.calendar({
        year: year,
        isHebrewYear: false,
      });
      const lines: string[] = [
        '| Gregorian date | Hebrew date | Holiday | Categories |',
        '| ---- | ---- | ---- | ---- |',
      ];
      for (const ev of events) {
        const hd = ev.getDate();
        const d = dayjs(hd.greg());
        const cats = ev.getCategories().filter(cat => cat !== 'holiday');
        lines.push(`| ${d.format('YYYY-MM-DD')} | ${hd.toString()} | ${ev.render('en')} | ${cats.join(', ')} |`);
      }
      return {
        content: [
          {
            type: "text",
            text: lines.join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    "daf-yomi",
    {
      description: "Calculates the Daf Yomi (Babylonian Talmud) learning for a specified date",
      inputSchema: {
        date: z.string().describe('Gregorian date in yyyy-MM-dd format'),
      },
    },
    async ({ date }) => {
      let dt;
      try {
        dt = isoDateStringToDate(date);
      } catch {
        return errorCard(`Error parsing date: ${date}`);
      }
      const hd = new HDate(dt);
      const ev = DailyLearning.lookup('dafYomi', hd, false);
      if (!ev) {
        return errorCard(`Can't find Daf Yomi for date: ${date}`);
      };
      const results = [
        `Daf Yomi (English): ${ev.renderBrief('en')}`,
        `Daf Yomi (Hebrew): ${ev.renderBrief('he')}`,
        `Hebrew date: ${hd.toString()}`,
        `Read the text of the Daf at: ${ev.url()}`,
      ];
      return {
        content: [
          {
            type: "text",
            uri: ev.url(),
            text: results.join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    "candle-lighting",
    {
      description: "Generates candle-lighting and Havdalah times for a given location and date range",
      inputSchema: {
        latitude: z.number().min(-90).max(90).describe('Latitude as decimal, valid range -90 to +90 (e.g. 41.85003)'),
        longitude: z.number().min(-180).max(180).describe('Longitude as decimal, valid range -180 to +180 (e.g. -87.65005)'),
        tzid: z.string().describe('Olson timezone ID (e.g. "America/Chicago", "Europe/Moscow")'),
        startDate: z.string().describe('Start date in yyyy-MM-dd format'),
        endDate: z.string().describe('End date in yyyy-MM-dd format'),
      },
    },
    async function ({ latitude, longitude, tzid, startDate, endDate }) {
      let start, end;
      try {
        start = isoDateStringToDate(startDate);
        end = isoDateStringToDate(endDate);
      } catch {
        return errorCard(`Error parsing dates: ${startDate} or ${endDate}`);
      }

      const lines = candleLighting(latitude, longitude, tzid, startDate, endDate);
      return {
        content: [
          {
            type: "text",
            text: lines.join('\n'),
          },
        ],
      };
    },
  );

  return server;
}
