import { Logging } from 'homebridge';
import { getLogPrefix } from 'homebridge/lib/logger.js';

export type ILogger = Pick<Logging, 'debug' | 'info' | 'warn' | 'error'> & {
    getLogger(category: string, ...categories: string[]): ILogger
}

export class ConsoleLogger implements ILogger {

    readonly debugEnabled: boolean;

    constructor(debugEnabled: boolean) {
        this.debugEnabled = debugEnabled;
    }

    info(message: string, ...parameters: any[]) {
        console.info(message, ...parameters);
    }

    warn(message: string, ...parameters: any[]) {
        console.warn(message, ...parameters);
    }

    error(message: string, ...parameters: any[]) {
        console.error(message, ...parameters);
    }

    debug(message: string, ...parameters: any[]) {
        console.debug(message, ...parameters);
    }

    getLogger(category: string, ...categories: string[]): ILogger {
        return new ContextLogger(this, category, ...categories);
    }

}

export const NullLogger: ILogger = {
    debug: (message: string, ...parameters: any[]) => {},
    info: (message: string, ...parameters: any[]) => {},
    warn: (message: string, ...parameters: any[]) => {},
    error: (message: string, ...parameters: any[]) => {},
    getLogger: (category: string, ...categories: string[]): ILogger => NullLogger
}

export class ContextLogger implements ILogger {

    private readonly logger: Omit<ILogger, 'getLogger'>;
    readonly categories: string[];
    readonly context: string;

    constructor(logger: Omit<ILogger, 'getLogger'>, ...categories: string[]) {
        this.logger = logger;
        this.categories = categories;
        this.context = `${categories.reduce((line, cat) => { line += '' + getLogPrefix(cat); return line; }, '')}`;
    }

    debug(message: string, ...parameters: any[]): void {
        this.logger.debug(this.context ? `${this.context} ${message}` : message, ...parameters);
    }

    error(message: string, ...parameters: any[]): void {
        this.logger.error(this.context ? `${this.context} ${message}` : message, ...parameters);
    }

    info(message: string, ...parameters: any[]): void {
        this.logger.info(this.context ? `${this.context} ${message}` : message, ...parameters);
    }

    warn(message: string, ...parameters: any[]): void {
        this.logger.warn(this.context ? `${this.context} ${message}` : message, ...parameters);
    }

    getLogger(category: string, ...categories: string[]): ILogger {
        return new ContextLogger(this.logger, ...[ ...this.categories, category, ...categories ]);
    }
}