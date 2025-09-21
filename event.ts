import { Context, HandlerConfiguration, type JsonObject } from './context.js'
import { registerEventHandler } from './host/event-registry.js'

export * from './context.js'

export type EventHandlerConfiguration = HandlerConfiguration & {}

export type Handler = (
    context: Context,
    subject: string,
    event: JsonObject | undefined,
    timestamp: Date,
    messageId: string,
) => Promise<void> | void

export function on(topic: string, event: string, fn: Handler): void
export function on(topic: string, event: string, config: HandlerConfiguration, fn: Handler): void
export function on(
    topic: string,
    event: string,
    configOrHandler: HandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerEventHandler(topic, event, configOrHandler, fn)
}
