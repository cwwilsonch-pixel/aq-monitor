interface LogData {
  [key: string]: any;
}

class Logger {
  private formatMessage(level: string, data: LogData | string, message?: string): string {
    const timestamp = new Date().toISOString();
    
    if (typeof data === 'string') {
      return `[${timestamp}] [${level}] ${data}`;
    }
    
    const msg = message || '';
    const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '';
    
    return `[${timestamp}] [${level}] ${msg}\n${dataStr}`;
  }

  info(data: LogData | string, message?: string) {
    console.log(this.formatMessage('INFO', data, message));
  }

  warn(data: LogData | string, message?: string) {
    console.warn(this.formatMessage('WARN', data, message));
  }

  error(data: LogData | string, message?: string) {
    console.error(this.formatMessage('ERROR', data, message));
  }

  debug(data: LogData | string, message?: string) {
    console.debug(this.formatMessage('DEBUG', data, message));
  }
}

export const logger = new Logger();