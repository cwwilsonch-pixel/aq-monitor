import morgan from 'morgan';
export function requestLogger() {
    return morgan('tiny');
}
