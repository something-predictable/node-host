import assert from 'node:assert/strict'
import type { LogEntry, LogTransport } from '../host/context.js'
import { makeLogger } from '../host/logging.js'

describe('logging', () => {
    it('enriches subsequent entries', async () => {
        const transport = new TestTransport()
        const logger = makeLogger(transport, undefined, new AbortController().signal)

        logger.enrich({ extra: 'info' })
        logger.debug('END')

        await logger.flush()
        assert.deepStrictEqual(transport.entries.map(withoutTimestamp), [
            { level: 'debug', message: 'END', extra: 'info' },
        ])
    })

    it('handles lists', async () => {
        const transport = new TestTransport()
        const logger = makeLogger(transport, undefined, new AbortController().signal)

        try {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 'error'
        } catch (e) {
            logger.error('A string', e)
        }
        try {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw [new Error('One error'), new Error('Other error')]
        } catch (e) {
            logger.error('A list', e)
        }
        try {
            await Promise.any([
                Promise.reject(new Error('One error')),
                Promise.reject(new Error('Other error')),
            ])
        } catch (e) {
            logger.error('An aggregate', e)
        }

        await logger.flush()

        assert.deepStrictEqual(
            transport.entries
                .filter(e => e.message === 'A string')
                .map(e => JSON.parse(e.json)?.error),
            [{ message: 'error', name: 'string' }],
        )
        assert.deepStrictEqual(
            transport.entries
                .filter(e => e.message === 'A list')
                .map(e => withoutStacktrace(JSON.parse(e.json)?.error)),
            [
                [
                    { message: 'One error', name: 'Error' },
                    { message: 'Other error', name: 'Error' },
                ],
            ],
        )
        assert.deepStrictEqual(
            transport.entries
                .filter(e => e.message === 'An aggregate')
                .map(e => withoutStacktrace(JSON.parse(e.json)?.error)),
            [
                {
                    message: 'All promises were rejected',
                    name: 'AggregateError',
                    errors: [
                        { message: 'One error', name: 'Error' },
                        { message: 'Other error', name: 'Error' },
                    ],
                },
            ],
        )
    })

    it('includes cause', async () => {
        const transport = new TestTransport()
        const logger = makeLogger(transport, undefined, new AbortController().signal)

        try {
            await fetch(`http://${Math.random()}x/`)
        } catch (e) {
            logger.error('With cause', e)
        }

        await logger.flush()
        assert.deepStrictEqual(
            transport.entries.map(e => JSON.parse(e.json)?.error?.cause?.code),
            ['ENOTFOUND'],
        )
    })

    it('handles cycles', async () => {
        const transport = new TestTransport()
        const logger = makeLogger(transport, undefined, new AbortController().signal)

        const error: any = new Error('AWS SDK')
        const extra: any = {}
        extra.extra = extra
        error.extra = extra
        logger.error('With cyclic properties', error)
        error.cause = error
        logger.error('With cyclic cause', error)

        await logger.flush()
        assert.deepStrictEqual(
            transport.entries.map(e => JSON.parse(e.json)?.error?.message),
            [
                `Converting circular structure to JSON
    --> starting at object with constructor 'Object'
    --- property 'extra' closes the circle`,
                'AWS SDK',
                `Converting circular structure to JSON
    --> starting at object with constructor 'Object'
    --- property 'extra' closes the circle`,
                'AWS SDK',
            ],
        )
    })
})

function withoutTimestamp(entry?: { json: string }): any {
    if (!entry) {
        return entry
    }
    const { timestamp, ...rest } = JSON.parse(entry.json)
    return rest
}

function withoutStacktrace(error: any): any {
    if (!error) {
        return error
    }
    if (Array.isArray(error)) {
        return error.map(withoutStacktrace)
    }
    if (error.errors) {
        error.errors = withoutStacktrace(error.errors)
    }
    delete error.stack
    return error
}

class TestTransport implements LogTransport {
    readonly entries: LogEntry[] = []

    sendEntries(entries: LogEntry[]) {
        this.entries.push(...entries)
    }
}
