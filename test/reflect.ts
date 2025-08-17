import assert from 'node:assert/strict'
import { copyFile, mkdir } from 'node:fs/promises'
import { reflect } from '../host/reflect.js'

describe('reflection', () => {
    before(async () => {
        await mkdir('node_modules/@riddance/host/host/', { recursive: true })
        await copyFile('host/registry.js', 'node_modules/@riddance/host/host/registry.js')
        await copyFile('host/meta.js', 'node_modules/@riddance/host/host/meta.js')
    })

    it('includes cause', async () => {
        const { revision, ...reflection } = await reflect(process.cwd())

        assert.ok((revision?.length === 8 && revision.endsWith('+')) || revision?.length === 7)
        assert.deepStrictEqual(reflection, {
            name: '@riddance/host',
            events: [],
            http: [],
            timers: [],
        })
    })
})
