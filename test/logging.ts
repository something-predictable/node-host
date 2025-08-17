import assert from 'node:assert/strict'
import type { LogEntry, LogTransport } from '../host/context.js'
import { makeLogger } from '../host/logging.js'

describe('logging', () => {
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
})

class TestTransport implements LogTransport {
    readonly entries: LogEntry[] = []

    sendEntries(entries: LogEntry[]) {
        this.entries.push(...entries)
    }
}
