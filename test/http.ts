import assert from 'node:assert/strict'
import type { LogEntry, LogTransport } from '../host/context.js'
import { executeRequest } from '../host/http.js'
import { makeLogger } from '../host/logging.js'
import type { Context, HttpRequest, Result } from '../http.js'

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
})

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
