import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HandlerConfiguration } from '../context.js'
import type { HttpHandlerConfiguration } from '../http.js'
import type { TimerHandlerConfiguration } from '../timer.js'
import { getHash } from './git.js'
import type { PackageConfiguration } from './meta.js'
import type { HandlersGetter } from './registry.js'

type CPU =
    | 'arm'
    | 'arm64'
    | 'ia32'
    | 'mips'
    | 'mipsel'
    | 'ppc'
    | 'ppc64'
    | 's390'
    | 's390x'
    | 'x32'
    | 'x64'
type CpuConfig = CPU | `!${CPU}`
type OSConfig = NodeJS.Platform | `!${NodeJS.Platform}`

export type PackageJsonConfiguration = {
    nodeVersion?: string
    cpus?: CpuConfig[]
    os?: OSConfig[]
}

export type Reflection = {
    name: string
    revision: string | undefined
    http: {
        name: string
        method: string
        pathPattern: string
        config: HttpHandlerConfiguration & PackageJsonConfiguration
    }[]
    timers: {
        name: string
        schedule: string
        config: TimerHandlerConfiguration & PackageJsonConfiguration
    }[]
    events: {
        name: string
        topic: string
        type: string
        config: HandlerConfiguration & PackageJsonConfiguration
    }[]
}

export function resolveCpu(config: PackageJsonConfiguration, supported: CPU[]): CPU {
    const resolved = resolveSupported(config.cpus, supported)
    if (!resolved) {
        // resolve<T>(config, supported) actually asserts config is (T | `!${T}`)[], but that's not supported yet.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        throw new Error('Unsupported CPUs: ' + config.cpus!.join(', '))
    }
    return resolved
}

export function resolveOS(
    config: PackageJsonConfiguration,
    supported: NodeJS.Platform[],
): NodeJS.Platform {
    const resolved = resolveSupported(config.os, supported)
    if (!resolved) {
        // resolve<T>(config, supported) actually asserts config is (T | `!${T}`)[], but that's not supported yet.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        throw new Error('Unsupported operating systems: ' + config.os!.join(', '))
    }
    return resolved
}

function resolveSupported<T extends string>(
    config: (T | `!${T}`)[] | undefined,
    supported: T[],
): T | undefined {
    if (!config) {
        return supported[0]
    }
    return supported.find(s => config.includes(s) && !config.includes(`!${s}`))
}

export async function reflect(path: string): Promise<Reflection> {
    const absolutePath = resolve(process.cwd(), path)
    const [packageJson, allFiles, revision] = await Promise.all([
        readConfig(absolutePath),
        readdir(absolutePath),
        getHash(absolutePath),
    ])
    const files = allFiles.filter(file => extname(file) === '.ts' && !file.endsWith('.d.ts'))
    const { getHandlers, setMeta } = (await import(
        pathToFileURL(join(absolutePath, 'node_modules/@riddance/host/host/registry.js')).toString()
    )) as {
        getHandlers: HandlersGetter
        setMeta: (
            packageName: string,
            fileName: string,
            rev: string | undefined,
            cfg: PackageConfiguration | undefined,
        ) => void
    }

    for (const file of files) {
        const base = basename(file, '.ts')
        setMeta(packageJson.name, base, revision, packageJson.config)
        await import(pathToFileURL(join(absolutePath, base + '.js')).toString())
    }

    return {
        name: packageJson.name,
        revision,
        http: getHandlers('http').map(h => ({
            config: {
                ...h.config,
                cpus: packageJson.cpu,
                os: packageJson.os,
                nodeVersion: packageJson.engines?.node,
            },
            name: h.meta?.fileName ?? '',
            method: h.method,
            pathPattern: h.pathPattern,
        })),
        timers: getHandlers('timer').map(h => ({
            config: {
                ...h.config,
                cpus: packageJson.cpu,
                os: packageJson.os,
                nodeVersion: packageJson.engines?.node,
            },
            name: h.meta?.fileName ?? '',
            schedule: h.schedule,
        })),
        events: getHandlers('event').map(h => ({
            config: {
                ...h.config,
                cpus: packageJson.cpu,
                os: packageJson.os,
                nodeVersion: packageJson.engines?.node,
            },
            name: h.meta?.fileName ?? '',
            topic: h.topic,
            type: h.type,
        })),
    }
}

async function readConfig(path: string) {
    const packageJson = JSON.parse(await readFile(join(path, 'package.json'), 'utf-8')) as {
        name: string
        engines?: { [engine: string]: string }
        cpu?: CpuConfig[]
        os?: OSConfig[]
        config?: object
    }
    return packageJson
}
