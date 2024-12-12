import { Context, HandlerConfiguration } from './context.js'
import { registerTimerHandler, type CronExpression } from './host/timer-registry.js'

export * from './context.js'

export type Timer = {
    readonly triggerTime: Date
}

export type TimerHandlerConfiguration = HandlerConfiguration & {
    /**
     * The TZ identifier identifying which time zone to the schedule is in, UTC if undefined.
     * @default undefined
     * @example 'America/Los_Angeles'
     */
    readonly timezone?: string
}

export type Handler = (context: Context, when: Timer) => Promise<void> | void

export function setInterval(schedule: CronExpression, fn: Handler): void
export function setInterval(
    schedule: CronExpression,
    config: HandlerConfiguration,
    fn: Handler,
): void
export function setInterval(
    schedule: CronExpression,
    configOrHandler: HandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerTimerHandler(schedule, configOrHandler, fn)
}
