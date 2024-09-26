import EventEmitter from 'events';
import { Detachable } from './common.js';

export class Availability {

    private readonly emitter: EventEmitter = new EventEmitter();
    private _available: boolean;
    private _error?: string | Error;

    private readonly timeoutMillis?: number;
    private timeout?: NodeJS.Timeout;

    constructor(available: boolean, timeoutMillis?: number) {
        this._available = available;
        this.timeoutMillis = timeoutMillis;
        if (available && !!timeoutMillis) {
            this.timeout = setTimeout(() => {
                this.setAvailable(false, `Did not receive any message from the server for ${timeoutMillis/1000} seconds`);
            }, timeoutMillis);
        }
        this.emitter.setMaxListeners(200);
    }

    close() {
        this.setAvailable(false, 'closed');
        this.emitter.removeAllListeners();
    }

    get available(): boolean {
        return this._available;
    }

    error() {
        return this.error;
    }

    on(event: 'change', handler: Availability.Handler): Detachable {
        this.emitter.on(event, handler);
        return {
            detach: () => this.emitter.off(event, handler)
        }
    }

    setAvailable(available: boolean, error?: string | Error) {
        clearTimeout(this.timeout);
        if (available && !!this.timeoutMillis) {
            this.timeout = setTimeout(() => {
                this.setAvailable(false, `Did not receive any message from the server for ${this.timeoutMillis!/1000} seconds`);
            }, this.timeoutMillis);
        }
        const change = this._available !== available;
        this._available = available;
        this._error = error;
        if (change) {
            this.emitter.emit('change', this._available, this._error);
        }
    }

    bindTo(other: Availability): Detachable {
        this.setAvailable(other._available, other._error);
        return other.on('change', (available, error) => {
            this.setAvailable(available, error);
        });
    }

}

export namespace Availability {

    export type Handler = (available: boolean, error?: string | Error) => void;

}