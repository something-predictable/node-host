import { randomUUID } from 'node:crypto'
import { Context, measure, type Json } from '../context.js'
import { RootLogger } from './context.js'
import type { EventHandler } from './event-registry.js'

export async function handle(
    log: RootLogger,
    context: Omit<Context, 'log'>,
    handler: EventHandler,
    options: {
        readonly subject: string
        readonly event:
            | {
                  readonly [key: string]: Json
              }
            | undefined
        readonly timestamp: Date
        readonly messageId?: string
    },
    success: () => Promise<unknown>,
): Promise<void> {
    log = log.enrichReserved({ meta: context.meta, event: options })
    log.trace('Event BEGIN')
    try {
        await measure(log, 'execution', () =>
            handler.entry(
                { ...context, log },
                options.subject,
                options.event,
                options.timestamp,
                options.messageId ?? randomUUID().replaceAll('-', ''),
            ),
        )
        log.debug('Event END')
        await success()
    } catch (e) {
        log.error('Event END', e)
    }
}
