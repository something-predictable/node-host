import { Context, measure } from '../context.js'
import { RootLogger } from './context.js'
import type { TimerHandler } from './timer-registry.js'

export async function triggerTimer(
    log: RootLogger,
    context: Omit<Context, 'log'>,
    handler: TimerHandler,
    options: {
        readonly triggerTime: Date
    },
    success: () => Promise<unknown>,
): Promise<void> {
    log = log.enrichReserved({ meta: context.meta, trigger: { time: triggerTimer } })
    log.trace('Timer BEGIN')
    try {
        await measure(log, 'execution', () => handler.entry({ ...context, log }, options))
        log.debug('Timer END')
        await success()
    } catch (e) {
        log.error('Timer END', e)
    }
}
