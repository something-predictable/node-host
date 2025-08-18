import { hash } from 'node:crypto'
import { brotliCompress } from 'node:zlib'
import { Context, measure } from '../context.js'
import type { Json, ParsedUrl, ResponseHeaders, Result } from '../http.js'
import { ClientInfo, RootLogger } from './context.js'
import type { HttpHandler } from './http-registry.js'

export type Response = {
    headers: { readonly [key: string]: string }
    status: number
    body?: string | Buffer
}

type RequestOptions = BodylessRequestOptions | StringRequestOptions | JsonRequestOptions

type BodylessRequestOptions = {
    uri: string
    headers?: { readonly [key: string]: string }
}

type StringRequestOptions = BodylessRequestOptions & {
    body: string
}

type JsonRequestOptions = BodylessRequestOptions & {
    json: Json
}

export async function executeRequest(
    log: RootLogger,
    context: Omit<Context, 'log'>,
    handler: HttpHandler,
    options: RequestOptions,
    success: () => Promise<unknown>,
): Promise<Response> {
    const isShallow =
        context.env.SHALLOW_KEY && options.headers?.['x-shallow'] === context.env.SHALLOW_KEY
    const includeBodyInLogs = !handler.config?.excludeBodyFromLogs
    const logRequest = includeBodyInLogs
        ? { method: handler.method, ...options }
        : withoutRequestBody({ method: handler.method, ...options })
    let enrichedLog = log.enrichReserved({ meta: context.meta, request: logRequest })
    if (isShallow) {
        enrichedLog.trace('Shallow request')
        return {
            headers: {},
            status: 204,
        }
    }
    enrichedLog.trace('Request BEGIN')
    try {
        let parsedUrl:
            | (ParsedUrl & {
                  /** @ignore */
                  __proto__: unknown
                  /** @ignore */
                  toString: () => string
              })
            | undefined
        let pathSteps: string[] | undefined
        const req = {
            rawUrl: options.uri,
            get url() {
                if (parsedUrl) {
                    return parsedUrl
                }
                const url = new URL(this.rawUrl)
                parsedUrl = {
                    // eslint-disable-next-line unicorn/no-null
                    __proto__: null,
                    hash: url.hash,
                    host: url.host,
                    hostname: url.hostname,
                    href: url.href,
                    origin: url.origin,
                    password: url.password,
                    pathname: url.pathname,
                    port: url.port,
                    protocol: url.protocol,
                    search: url.search,
                    get searchParams() {
                        return url.searchParams
                    },
                    toJSON: () => url.toJSON(),
                    toString: () => url.toString(),
                    username: url.username,
                    pathStepAt: (index: number) => {
                        const steps = (pathSteps ??= url.pathname.split('/'))
                        const step = steps[index + 1]
                        if (!step) {
                            throw Object.assign(
                                new RangeError(`Path does not have a step at index ${index}.`),
                                {
                                    rawUrl: this.rawUrl,
                                    pathName: url.pathname,
                                    steps: steps.slice(1),
                                },
                            )
                        }
                        return step
                    },
                }
                return parsedUrl
            },
            body: requestBody(options),
            headers: options.headers ?? {},
        }

        const result = await measure(log.enrichReserved({ meta: context.meta }), 'execution', () =>
            handler.entry({ ...context, log: enrichedLog }, req),
        )

        const response = resultToResponse(result, includeBodyInLogs)

        if (context.signal.aborted) {
            response.headers = {
                'x-timeout': '1',
                ...response.headers,
            }
        }

        enrichedLog = enrichedLog.enrichReserved({
            response: {
                status: response.status,
                headers: response.headers,
                body: response.logBody,
            },
        })
        if (response.status < 300) {
            enrichedLog.debug('Request END')
            await success()
        } else {
            enrichedLog.warn('Request END')
        }
        return await compressed(req.headers, eTagged(req.headers, response))
    } catch (e) {
        try {
            const response = errorToResponse(e)
            enrichedLog = enrichedLog.enrichReserved({ response })
            enrichedLog.error('Request END', e)
            return response
        } catch (convertError) {
            enrichedLog.error('Could not convert exception to error response.', convertError)
            return {
                headers: {},
                status: 500,
            }
        }
    }
}

function resultToResponse(result: Result, withLogBody: boolean): Response & { logBody?: unknown } {
    if (!result) {
        return {
            headers: {},
            status: 204,
        }
    } else if (typeof result === 'string') {
        const logBody = withLogBody ? result : undefined
        return {
            headers: {
                'content-type': 'text/plain',
            },
            status: 200,
            body: result,
            logBody,
        }
    } else {
        if (result.body === undefined) {
            return {
                headers: result.headers ?? {},
                status: result.status ?? 200,
            }
        } else if (typeof result.body === 'string') {
            const logBody = withLogBody ? result.body : undefined
            return {
                headers: withContentType(result.headers, 'text/plain'),
                status: result.status ?? 200,
                body: result.body,
                logBody,
            }
        } else if (Buffer.isBuffer(result.body)) {
            const logBody = withLogBody ? result.body.toString('base64') : undefined
            return {
                headers: withContentType(result.headers, 'application/octet-stream'),
                status: result.status ?? 200,
                body: result.body,
                logBody,
            }
        } else {
            const logBody = withLogBody ? result.body : undefined
            return {
                headers: withContentType(result.headers, 'application/json'),
                status: result.status ?? 200,
                body: JSON.stringify(result.body),
                logBody,
            }
        }
    }
}

function withoutRequestBody(options: RequestOptions & { method: string }) {
    if ('json' in options) {
        const { json, ...bodyless } = options
        return bodyless
    }
    if ('body' in options) {
        const { body, ...bodyless } = options
        return bodyless
    }
    return options
}

function requestBody(options: RequestOptions): Json | string | undefined {
    if ('json' in options) {
        return options.json
    }
    if ('body' in options) {
        return options.body
    }
    return undefined
}

function withContentType(headers: ResponseHeaders | undefined, contentType: string) {
    if (!headers) {
        return {
            'content-type': contentType,
        }
    }
    headers['content-type'] ??= contentType
    return headers
}

function errorToResponse(e: unknown): Response {
    const { body, statusCode: status } = e as { body?: unknown; statusCode?: number }
    if (typeof body === 'string') {
        return {
            headers: {
                'content-type': 'text/plain',
            },
            status: status ?? 500,
            body,
        }
    } else if (typeof body === 'object') {
        return {
            headers: {
                'content-type': 'application/json',
            },
            status: status ?? 500,
            body: JSON.stringify(body),
        }
    } else {
        return {
            headers: {},
            status: status ?? 500,
        }
    }
}

export function clientFromHeaders(
    headers: { readonly [key: string]: string } | undefined,
): ClientInfo {
    if (!headers) {
        return {}
    }
    const address = headers['x-forwarded-for']?.split(':')
    return {
        operationId: headers['x-request-id'] ?? headers['request-id'],
        clientId:
            headers['x-client-id'] ??
            headers['x-installation-id'] ??
            headers['client-id'] ??
            headers['installation-id'],
        clientIp: address?.[0],
        clientPort: Number(address?.[1]) || undefined,
        userAgent: headers['x-forwarded-for-user-agent'] ?? headers['user-agent'],
    }
}

function eTagged(
    requestHeaders: { [key: string]: string },
    response: Response & { headers: { [key: string]: string } },
): Response {
    if (response.headers.etag || !response.body) {
        return response
    }
    const etag = hash('sha1', response.body, 'base64').slice(0, -1)
    response.headers.etag = etag
    if (requestHeaders['if-none-match'] === etag) {
        response.status = 304
        delete response.body
    }
    return response
}

async function compressed(
    requestHeaders: { [key: string]: string },
    response: Response & { headers: { [key: string]: string } },
): Promise<Response> {
    if (!response.body || response.body.length < 32_768 || response.headers['content-encoding']) {
        return response
    }
    const encodings = requestHeaders['accept-encoding']?.split(',').map(e => e.trim())
    if (!encodings?.includes('br')) {
        return response
    }
    return {
        status: response.status,
        headers: {
            'content-encoding': 'br',
            ...response.headers,
        },
        body: await compress(response.body),
    }
}

function compress(body: string | Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
        brotliCompress(body, {}, (error, result) => {
            if (error) {
                reject(error)
                return
            }
            resolve(result)
        })
    })
}
