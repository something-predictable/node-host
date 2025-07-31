import { type HandlerConfiguration, type Handler as TimerFunction } from '../timer.js'
import { combineConfig, getMetadata, type FullConfiguration, type Metadata } from './meta.js'
import { addHandler } from './registry.js'

export type TimerHandler = {
    meta: Metadata | undefined
    config: FullConfiguration | undefined
    schedule: CronExpression
    entry: TimerFunction
}

type TimerHost = (
    meta: Metadata | undefined,
    config: HandlerConfiguration | undefined,
    schedule: CronExpression,
    handler: TimerFunction,
) => void

let timerHostRegistry: TimerHost

function setTimerHost(host: TimerHost) {
    timerHostRegistry = host
}

type MinuteField = string
type HourField = string
type DayOfMonthField = string
type MonthField = string
type DayOfWeekField = string

export type CronExpression =
    `${MinuteField} ${HourField} ${DayOfMonthField} ${MonthField} ${DayOfWeekField}`

function timerHost(
    meta: Metadata | undefined,
    cfg: HandlerConfiguration | undefined,
    schedule: CronExpression,
    entry: TimerFunction,
) {
    addHandler('timer', {
        meta,
        config: combineConfig(meta?.config, cfg),
        schedule,
        entry,
    })
}

setTimerHost(timerHost)

export function registerTimerHandler(
    schedule: CronExpression,
    configOrHandler: HandlerConfiguration | TimerFunction,
    fn?: TimerFunction,
): void {
    if (typeof configOrHandler === 'function') {
        timerHostRegistry(getMetadata(), undefined, schedule, configOrHandler)
    } else {
        if (!fn) {
            throw new Error('Please provide a handler function.')
        }
        timerHostRegistry(getMetadata(), configOrHandler, schedule, fn)
    }
}
