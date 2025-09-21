import { isIPv4 } from 'node:net'
import { performance } from 'node:perf_hooks'
import { highPrecisionISODate } from './host/logging.js'

export type Environment = {
    readonly [key: string]: string
}

export type Logger = {
    enrich(fields: JsonSafeObject): void
    trace(message: string, error?: unknown, fields?: JsonSafeObject): void
    debug(message: string, error?: unknown, fields?: JsonSafeObject): void
    info(message: string, error?: unknown, fields?: JsonSafeObject): void
    warn(message: string, error?: unknown, fields?: JsonSafeObject): void
    error(message: string, error?: unknown, fields?: JsonSafeObject): void
    fatal(message: string, error?: unknown, fields?: JsonSafeObject): void
}

export type MutableJson =
    | null
    | boolean
    | number
    | string
    | MutableJson[]
    | { [key: string]: MutableJson }
export type Json = null | boolean | number | string | readonly Json[] | JsonObject
export type JsonObject = { readonly [key: string]: Json }

export type JsonSafe =
    | undefined
    | null
    | boolean
    | number
    | string
    | { toJSON: () => string }
    | readonly JsonSafe[]
    | JsonSafeObject

export type JsonSafeObject = { readonly [key: string]: JsonSafe }

export type HandlerConfiguration = {
    /**
     * An indication of CPU usage of the handler.
     * @default 'low'
     */
    readonly compute?: 'high' | 'low'
    /**
     * An indication of memory usage of the handler.
     * @default 'low'
     */
    readonly memory?: 'high' | 'low'
    /**
     * A boolean indicating whether to enrich the log with the body of events, requests or responses. Set to false if the body is large or contain very sensitive data.
     * @default false
     */
    readonly excludeBodyFromLogs?: boolean
    /**
     * The level below which log entries will be discarded.
     * @default 'trace'
     */
    readonly minimumLogLevel?: 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal'
    /**
     * The number of seconds the function is expected to finish executing in.
     */
    readonly timeout?: number
}

export type Context = {
    readonly env: Environment
    readonly log: Logger
    readonly signal: AbortSignal
    now(): Date

    readonly operationId?: string
    readonly client?: {
        readonly id?: string
        readonly ip?: string
        readonly port?: number
        readonly userAgent?: string
    }
    readonly meta?: {
        readonly packageName: string
        readonly fileName: string
        readonly revision?: string
    }

    emit(
        topic: string,
        type: string,
        subject: string,
        data?: Json,
        messageId?: string,
    ): Promise<void>

    onSuccess(fn: () => Promise<void> | void): void
}

export function httpRequestHeaders({
    meta,
    operationId,
    client,
}: Pick<Context, 'meta' | 'operationId' | 'client'>) {
    const headers: { [key: string]: string } = {
        'user-agent': `${meta?.packageName ?? '?'}/${meta?.revision ?? '?'}`,
    }
    if (operationId) {
        headers['x-request-id'] = operationId
    }
    if (client) {
        if (client.id) {
            headers['x-client-id'] = client.id
        }
        const { ip, port } = client
        if (!!ip || !!port) {
            const xff = forwardedFor(ip, port)
            if (xff) {
                headers['x-forwarded-for'] = xff
            }
        }
        if (client.userAgent) {
            headers['x-forwarded-for-user-agent'] = client.userAgent
        }
    }
    return headers
}

function forwardedFor(ip: string | undefined, port: number | undefined) {
    if (!port) {
        if (ip) {
            return ip
        }
        return undefined
    }
    if (!ip) {
        return `:${port}`
    }
    if (isIPv4(ip)) {
        return `${ip}:${port}`
    }
    return `[${ip}]:${port}`
}

export async function measure<T>(
    logger: { trace: (message: string, _: undefined, f: JsonSafeObject) => void },
    name: string,
    fn: () => Promise<T> | T,
    fields?: JsonSafeObject,
) {
    const start = performance.now()
    try {
        return await fn()
    } finally {
        const end = performance.now()
        logger.trace(`Measurement of ${name} time`, undefined, {
            start: highPrecisionISODate(start),
            end: highPrecisionISODate(end),
            duration: (Math.round(end * 10_000) - Math.round(start * 10_000)) / 10_000,
            ...fields,
        })
    }
}
