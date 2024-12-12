import type { HttpHandler } from './http-registry.js'
import type { TimerHandler } from './timer-registry.js'

export * from './meta.js'

type HandlerTypes = {
    http: HttpHandler
    timer: TimerHandler
}

const handlers: { [Type in keyof HandlerTypes]?: HandlerTypes[Type][] } = {}

export function addHandler<Type extends keyof HandlerTypes>(
    type: Type,
    handler: HandlerTypes[Type],
) {
    const h: HandlerTypes[Type][] = (handlers[type] ??= [])
    h.push(handler)
}

export type HandlersGetter = typeof getHandlers

export function getHandlers<Type extends keyof HandlerTypes>(type: Type) {
    return handlers[type] ?? ([] as HandlerTypes[Type][])
}

export function getHandler<Type extends keyof HandlerTypes>(type: Type) {
    const hs = getHandlers(type)
    const [handler] = hs
    if (!handler) {
        throw new Error(`No ${type} handler registered.`)
    }
    if (hs.length !== 1) {
        throw new Error(`Multiple ${type} handlers registered.`)
    }
    return handler
}
