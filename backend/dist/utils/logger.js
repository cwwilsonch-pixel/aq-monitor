class Logger {
    formatMessage(level, data, message) {
        const timestamp = new Date().toISOString();
        if (typeof data === 'string') {
            return `[${timestamp}] [${level}] ${data}`;
        }
        const msg = message || '';
        const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '';
        return `[${timestamp}] [${level}] ${msg}\n${dataStr}`;
    }
    info(data, message) {
        console.log(this.formatMessage('INFO', data, message));
    }
    warn(data, message) {
        console.warn(this.formatMessage('WARN', data, message));
    }
    error(data, message) {
        console.error(this.formatMessage('ERROR', data, message));
    }
    debug(data, message) {
        console.debug(this.formatMessage('DEBUG', data, message));
    }
}
export const logger = new Logger();
