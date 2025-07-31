import { Context, Environment, Json, Logger } from '../context.js'
import { makeLogger } from './logging.js'
import type { FullConfiguration, Metadata } from './meta.js'

export type ClientInfo = {
    readonly operationId?: string
    readonly clientId?: string
    readonly clientIp?: string
    readonly clientPort?: number
    readonly userAgent?: string
}

export type EventTransport = {
    sendEvent(
        topic: string,
        type: string,
        subject: string,
        data:
            | {
                  readonly [key: string]: Json
              }
            | undefined,
        messageId: string | undefined,
        signal: AbortSignal,
    ): Promise<void>
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal'

export type LogEntry = {
    readonly level: LogLevel
    readonly timestamp: number
    readonly message: string
    readonly error: unknown
    readonly json: string
}

export type LogTransport = {
    readonly publishRate?: number
    sendEntries(entries: LogEntry[], signal: AbortSignal): Promise<void> | undefined
}

class LogMulticaster implements LogTransport {
    readonly #transports: LogTransport[]
    readonly publishRate: number

    constructor(transports: LogTransport[]) {
        this.#transports = transports
        this.publishRate = transports.map(t => t.publishRate).sort()[0] ?? Number.MAX_SAFE_INTEGER
    }

    sendEntries(entries: LogEntry[], signal: AbortSignal) {
        const promises = this.#transports.map(t => t.sendEntries(entries, signal)).filter(p => !!p)
        if (promises.length === 0) {
            return
        }
        return Promise.all(promises) as unknown as Promise<void>
    }
}

export type RootLogger = {
    enrichReserved(fields: object): RootLogger
    flush(): Promise<void>
} & Logger

export function createContext(
    clientInfo: ClientInfo,
    loggers: LogTransport[],
    eventTransport: EventTransport,
    timeouts: { default: number; cap?: number },
    outerController: AbortController,
    config?: FullConfiguration,
    meta?: Metadata,
    environment?: Environment,
    now?: () => Date,
): {
    log: RootLogger
    context: Omit<Context, 'log'>
    success: () => Promise<unknown>
    flush: () => Promise<void>
} {
    const timeout =
        (timeouts.cap
            ? Math.min(config?.timeout ?? timeouts.default, timeouts.cap)
            : (config?.timeout ?? timeouts.default)) * 1000
    const innerController = new AbortController()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const logTransport = loggers.length === 1 ? loggers[0]! : new LogMulticaster(loggers)
    const logger = makeLogger(
        logTransport,
        config?.minimumLogLevel,
        outerController.signal,
    ).enrichReserved({
        operationId: clientInfo.operationId,
        client: {
            id: clientInfo.clientId,
            ip: clientInfo.clientIp,
            port: clientInfo.clientPort,
            userAgent: clientInfo.userAgent,
        },
    })
    globalLogger = logger
    const successHandlers: (() => Promise<void> | void)[] = []
    const ctx = {
        env: environment ?? (process.env as Environment),
        signal: innerController.signal,
        now: now ?? (() => new Date()),
        operationId: clientInfo.operationId,
        client: {
            id: clientInfo.clientId,
            ip: clientInfo.clientIp,
            port: clientInfo.clientPort,
            userAgent: clientInfo.userAgent,
        },
        meta: meta
            ? {
                  packageName: meta.packageName,
                  fileName: meta.fileName,
                  revision: meta.revision,
              }
            : undefined,
        emit: (
            topic: string,
            type: string,
            subject: string,
            data?: {
                readonly [key: string]: Json
            },
            messageId?: string,
        ) =>
            eventTransport.sendEvent(topic, type, subject, data, messageId, outerController.signal),
        onSuccess: (fn: () => Promise<void> | void) => successHandlers.push(fn),
    }
    const timeoutHandle = setTimeout(() => {
        logger.error('Timeout.', undefined, undefined)
        innerController.abort()
        // eslint-disable-next-line no-void
        void logger.flush()
    }, timeout)
    const flushHandle = setTimeout(() => {
        logger.error('Aborting flush.', undefined, undefined)
        outerController.abort()
    }, timeout + 15_000)
    return {
        log: logger,
        context: ctx,
        success: () => Promise.all(successHandlers.map(fn => fn())),
        flush: async () => {
            clearTimeout(timeoutHandle)
            await logger.flush()
            clearTimeout(flushHandle)
        },
    }
}

let globalLogger: Logger | undefined

process.on('uncaughtException', err => {
    globalLogger?.fatal('Uncaught exception.', err, undefined)
})
process.on('unhandledRejection', reason => {
    globalLogger?.fatal('Unhandled rejection.', reason, undefined)
})
