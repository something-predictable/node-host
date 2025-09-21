import assert from 'node:assert/strict'
import type { LogEntry, LogTransport } from '../host/context.js'
import { clientFromHeaders, executeRequest } from '../host/http.js'
import { makeLogger } from '../host/logging.js'
import { httpRequestHeaders, type Context, type HttpRequest, type Result } from '../http.js'

describe('http', () => {
    it('handles text response', async () => {
        const response = await executeHandler(() => {
            return {
                body: 'response body',
            }
        })
        assert.deepStrictEqual(response, {
            status: 200,
            headers: {
                'content-type': 'text/plain',
                // spell-checker: ignore Igudy LRMQE
                etag: 'ts/27mdLU5IgudyELJkBNcLRMQE',
            },
            body: 'response body',
        })
    })

    it('handles object response', async () => {
        const response = await executeHandler(() => {
            return {
                body: { message: 'response body' },
            }
        })
        assert.deepStrictEqual(response, {
            status: 200,
            headers: {
                'content-type': 'application/json',
                etag: 'ZwAoZBg/P7JfAVoj+eS6P814iKk',
            },
            body: '{"message":"response body"}',
        })
    })

    it('handles etag caching', async () => {
        const uncachedResponse = await executeHandler(() => {
            return {
                body: { message: 'response body' },
            }
        })
        const response = await executeHandler(
            () => {
                return {
                    body: { message: 'response body' },
                }
            },
            {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                'if-none-match': uncachedResponse.headers.etag!,
            },
        )
        assert.deepStrictEqual(response, {
            status: 304,
            headers: {
                'content-type': 'application/json',
                etag: 'ZwAoZBg/P7JfAVoj+eS6P814iKk',
            },
        })

        const changedResponse = await executeHandler(
            () => {
                return {
                    body: { message: 'new response body' },
                }
            },
            {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                'if-none-match': uncachedResponse.headers.etag!,
            },
        )
        assert.deepStrictEqual(changedResponse, {
            status: 200,
            headers: {
                'content-type': 'application/json',
                // spell-checker: ignore Ashk
                etag: 'Va6G6GT8Ashk7WoEvX3TvNwV+Fs',
            },
            body: '{"message":"new response body"}',
        })
    })

    it('compresses large responses', async () => {
        const response = await executeHandler(
            () => {
                return {
                    body: {
                        message: Array.from({ length: 100_000 }).map(_ => 'hello'),
                    },
                }
            },
            {
                'accept-encoding': 'gzip, deflate, br, zstd',
            },
        )
        assert.deepStrictEqual(response.headers['content-encoding'], 'br')
        assert.ok((response.body?.length ?? Number.NaN) < 10_000)
    })

    describe('parses forwarded header', () => {
        // eslint-disable-next-line unicorn/consistent-function-scoping
        const internal = (client: { ip?: string; port?: number }) =>
            httpRequestHeaders({ client })['x-forwarded-for']

        for (const [actual, expected] of [
            ['xyz', {}],
            ['1.2.3.4', { clientIp: '1.2.3.4' }],
            [internal({ ip: '1.2.3.4' }), { clientIp: '1.2.3.4' }],
            ['1.002.003.4', {}],
            ['1.2.3.4, 2.3.4.5', { clientIp: '1.2.3.4' }],
            ['1.2.3.4:56', { clientIp: '1.2.3.4', clientPort: 56 }],
            [':56', { clientPort: 56 }],
            [internal({ port: 56 }), { clientPort: 56 }],
            ['xyz, 1.2.3.4:56', { clientIp: '1.2.3.4', clientPort: 56 }],
            ['1.2.3.4:56,2.3.4.5:67', { clientIp: '1.2.3.4', clientPort: 56 }],
            ['1.2.3.4:56, 2.3.4.5:67', { clientIp: '1.2.3.4', clientPort: 56 }],
            ['203.0.113.195, 70.41.3.18, 150.172.238.178', { clientIp: '203.0.113.195' }],
            ['203.0.113.195', { clientIp: '203.0.113.195' }],
            [
                '2001:db8:85a3:8d3:1319:8a2e:370:7348',
                { clientIp: '2001:db8:85a3:8d3:1319:8a2e:370:7348' },
            ],
            [
                internal({ ip: '2001:db8:85a3:8d3:1319:8a2e:370:7348' }),
                { clientIp: '2001:db8:85a3:8d3:1319:8a2e:370:7348' },
            ],
            [
                '203.0.113.195:41237, 198.51.100.100:38523',
                { clientIp: '203.0.113.195', clientPort: 41_237 },
            ],
            [
                '[2001:db8::1a2b:3c4d]:41237, 198.51.100.100:26321',
                { clientIp: '2001:db8::1a2b:3c4d', clientPort: 41_237 },
            ],
            [
                internal({ ip: '2001:db8::1a2b:3c4d', port: 41_237 }),
                { clientIp: '2001:db8::1a2b:3c4d', clientPort: 41_237 },
            ],
            ['2001:db8::aa:bb', { clientIp: '2001:db8::aa:bb' }],
            ['[2001:db8::aa:bb]', { clientIp: '2001:db8::aa:bb' }],
            ['[2001:db8::1234]', { clientIp: '2001:db8::1234' }],
            ['2404:0068:0000:0000:0000:0000:0000:0000', { clientIp: '2404:68::' }],
            ['[2404:0068:0000:0000:0000:0000:0000:0000]', { clientIp: '2404:68::' }],
            [
                '[2404:0068:0000:0000:0000:0000:0000:0000]:23',
                { clientIp: '2404:68::', clientPort: 23 },
            ],
            ['[0000:0000:0000:0000:0000:0000:0000:0001]', { clientIp: '::1' }],
            ['0000:0000:0000:0000:0000:0000:0000:0001', { clientIp: '::1' }],
            ['::ffff:192.168.1.1', { clientIp: '192.168.1.1' }],
            ['[::ffff:192.168.1.1]', { clientIp: '192.168.1.1' }],
            ['[::ffff:192.168.1.1]:23', { clientIp: '::ffff:c0a8:101', clientPort: 23 }], // Not ideal
        ] as const) {
            it(actual ?? 'undefined', () => {
                assert.deepStrictEqual(
                    withoutUndefined(
                        clientFromHeaders({
                            'x-forwarded-for': actual,
                        }),
                    ),
                    withoutUndefined(expected),
                )
            })
        }
    })
})

function withoutUndefined(obj: { [key: string]: unknown }) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

async function executeHandler(
    handler: (context: Context, request: HttpRequest) => Result,
    headers?: { [key: string]: string },
) {
    const abortController = new AbortController()
    const transport = new TestTransport()
    const logger = makeLogger(transport, undefined, abortController.signal)

    const response = await executeRequest(
        logger,
        {
            now: () => new Date(),
            emit: () => Promise.resolve(),
            onSuccess: () => {
                //
            },
            env: {},
            signal: abortController.signal,
        },
        {
            meta: undefined,
            config: undefined,
            method: 'GET',
            pathPattern: '/',
            entry: handler,
        },
        {
            uri: '',
            headers,
        },
        () => Promise.resolve(),
    )
    delete (response as any).logBody
    return response
}

class TestTransport implements LogTransport {
    readonly entries: LogEntry[] = []

    sendEntries(entries: LogEntry[]) {
        this.entries.push(...entries)
    }
}
