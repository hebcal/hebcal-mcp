import pino, { Logger } from 'pino';

export function makeLogger(logDir: string): Logger {
  const transport = pino.transport({
    target: 'pino/file',
    level: process.env.NODE_ENV == 'production' ? 'info' : 'debug',
    options: {destination: logDir + '/mcp.log'},
  });
  const logger = pino(transport);

  function handler(err: unknown, evt: string) {
    const msg = `Express server caught ${evt}; exiting...`;
    console.log(msg);
    logger.info(msg);
    if (err) {
      console.log(err);
      logger.fatal(err, 'error caused exit');
    }
    // eslint-disable-next-line n/no-process-exit
    process.exit(err ? 1 : 0);
  }

  // catch all the ways node might exit
  process.on('beforeExit', () => handler(null, 'beforeExit'));
  process.on('uncaughtException', (err) => handler(err, 'uncaughtException'));
  process.on('unhandledRejection', (err) => handler(err, 'unhandledRejection'));
  process.on('SIGINT', () => handler(null, 'SIGINT'));
  process.on('SIGQUIT', () => handler(null, 'SIGQUIT'));
  process.on('SIGTERM', () => handler(null, 'SIGTERM'));

  return logger;
}

const units = ['bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

function niceBytes(num: number): string {
  let l = 0;
  let n = parseInt(num as unknown as string, 10) || 0;
  while (n >= 1024 && ++l) {
    n = n / 1024;
  }
  return (n.toFixed(n < 10 && l > 0 ? 1 : 0) + ' ' + units[l]);
}

export function logMemoryUsage(logger: pino.Logger) {
  const memoryUsage = process.memoryUsage();
  const heapTotal = niceBytes(memoryUsage.heapTotal);
  const heapUsed = niceBytes(memoryUsage.heapUsed);
  logger.info(`heap ${heapTotal} total, ${heapUsed} used`);
}
