import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import normalizePath from 'normalize-path'

type Return<T> = T extends null | undefined
  ? []
  : T extends Array<any>
  ? T
  : T extends Iterable<infer E> | ArrayLike<infer E>
  ? E[]
  : [T]

function isObject(value: any) {
  const type = typeof value
  return value !== null && (type === 'object' || type === 'function')
}

function isIterable<T>(value: any): value is Iterable<T> {
  return (
    isObject(value) &&
    typeof (value as Iterable<T>)[Symbol.iterator] === 'function'
  )
}

function isArrayLike<T>(value: any): value is ArrayLike<T> {
  return isObject(value) && typeof (value as Array<T>).length === 'number'
}

export function toBeArray<T>(value: T): Return<T> {
  if (value === null || value === undefined) return [] as Return<T>

  if (Array.isArray(value)) return value as Return<T>

  if (isIterable(value) || isArrayLike(value))
    return Array.from(value) as Return<T>

  // non-null primitive types and other object types
  return [value] as Return<T>
}

export function parseFiles(files: string | string[], context: string) {
  return toBeArray(files).map((file) => normalizePath(resolve(context, file)))
}

export function parseFoldersToGlobs(
  patterns: string | string[],
  extensions: string | string[] = [],
) {
  const extensionsList = toBeArray(extensions)
  const [prefix, postfix] = extensionsList.length > 1 ? ['{', '}'] : ['', '']
  const extensionsGlob = extensionsList
    .map((extension) => extension.replace(/^\./u, ''))
    .join(',')

  return toBeArray(patterns).map((pattern) => {
    try {
      // The patterns are absolute because they are prepended with the context.
      const stats = statSync(pattern)
      /* istanbul ignore else */
      if (stats.isDirectory()) {
        return pattern.replace(
          /[/\\]*?$/u,
          `/**${
            extensionsGlob ? `/*.${prefix + extensionsGlob + postfix}` : ''
          }`,
        )
      }
    } catch (_) {
      // Return the pattern as is on error.
    }
    return pattern
  })
}

export const jsonStringifyReplacerSortKeys = (_: string, value: any) => {
  const insert = (sorted: Record<string, any>, key: string | number) => {
    sorted[key] = value[key]
    return sorted
  }

  return value instanceof Object && !(value instanceof Array)
    ? Object.keys(value).sort().reduce(insert, {})
    : value
}
