import type { HandlerConfiguration } from '../context.js'

export type PackageConfiguration = HandlerConfiguration & {
    // Placeholder for package-level configurations
}

// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
export type FullConfiguration = PackageConfiguration & HandlerConfiguration

export function combineConfig(
    base: PackageConfiguration | undefined,
    override: HandlerConfiguration | undefined,
): FullConfiguration | undefined {
    if (base === undefined) {
        return override
    } else if (override === undefined) {
        return base
    }
    return { ...base, ...override }
}

let metadata: Metadata | undefined

export function setMeta(
    packageName: string,
    fileName: string,
    revision: string | undefined,
    config: PackageConfiguration | undefined,
) {
    metadata = {
        packageName,
        fileName,
        revision,
        config,
    }
}

export type Metadata = {
    packageName: string
    fileName: string
    revision: string | undefined
    config?: PackageConfiguration
}

export function getMetadata() {
    return metadata
}
