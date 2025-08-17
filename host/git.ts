import { exec } from 'node:child_process'

export async function getHash(path: string) {
    try {
        const [clean, hash = ''] = await Promise.all([isClean(path), getCommittedHash(path)])
        if (clean) {
            return hash.slice(0, 7)
        }
        return hash.slice(0, 7) + '+'
    } catch {
        return undefined
    }
}

async function isClean(path: string) {
    const changes = await execAsync(path, 'git status --short')
    return changes.length === 0
}

async function getCommittedHash(path: string) {
    const [long] = await execAsync(path, 'git rev-parse HEAD')
    return long
}

function execAsync(path: string, cmd: string) {
    return new Promise<string[]>((resolve, reject) => {
        exec(cmd, { cwd: path }, (err, stdout) => {
            if (err) {
                reject(err)
                return
            }
            resolve(stdout.split('\n').slice(0, -1))
        })
    })
}
