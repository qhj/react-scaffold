import { dirname, isAbsolute, join } from 'node:path'

import { ESLintError } from './eslint-error'
import { getESLint } from './get-eslint'
import { toArray } from './utils'
import { ESLint } from 'eslint'
import type { Options, FormatterFunction } from './options'
import { Compilation, Compiler } from 'webpack'

type GenerateReport = (compilation: Compilation) => Promise<void>
export type Report = {
  errors?: ESLintError
  warnings?: ESLintError
  generateReportAsset?: GenerateReport
}
export type Reporter = () => Promise<Report>
export type Linter = (files: string | string[]) => void
type LintResultMap = { [files: string]: ESLint.LintResult }

const resultStorage: WeakMap<Compiler, LintResultMap> = new WeakMap()

export function linter(
  key: string | undefined,
  options: Options,
  compilation: Compilation,
): { lint: Linter; report: Reporter; threads: number } {
  let eslint: ESLint

  let lintFiles: (files: string | string[]) => Promise<ESLint.LintResult[]>

  let cleanup: () => Promise<void>

  let threads: number

  const rawResults: Promise<ESLint.LintResult[]>[] = []

  const crossRunResultStorage = getResultStorage(compilation)

  try {
    ;({ eslint, lintFiles, cleanup, threads } = getESLint(key, options))
  } catch (e) {
    throw new ESLintError((e as Error).message)
  }

  return {
    lint,
    report,
    threads,
  }

  function lint(files: string | string[]) {
    for (const file of toArray(files)) {
      delete crossRunResultStorage[file]
    }
    rawResults.push(
      lintFiles(files).catch((e) => {
        // @ts-ignore
        compilation.errors.push(new ESLintError(e.message))
        return []
      }),
    )
  }

  async function report() {
    // Filter out ignored files.
    let results = await removeIgnoredWarnings(
      eslint,
      // Get the current results, resetting the rawResults to empty
      await flatten(rawResults.splice(0, rawResults.length)),
    )

    await cleanup()

    for (const result of results) {
      crossRunResultStorage[result.filePath] = result
    }

    results = Object.values(crossRunResultStorage)

    // do not analyze if there are no results or eslint config
    if (!results || results.length < 1) {
      return {}
    }

    const formatter = await loadFormatter(eslint, options.formatter)
    const { errors, warnings } = await formatResults(
      formatter,
      parseResults(options, results),
    )

    return {
      errors,
      warnings,
      generateReportAsset,
    }

    async function generateReportAsset({ compiler }: Compilation) {
      const { outputReport } = options
      const save = (name: string, content: string | Buffer): Promise<void> =>
        new Promise((finish, bail) => {
          const { mkdir, writeFile } = compiler.outputFileSystem
          // ensure directory exists
          // @ts-ignore - the types for `outputFileSystem` are missing the 3 arg overload
          mkdir(dirname(name), { recursive: true }, (err) => {
            /* istanbul ignore if */
            if (err) bail(err)
            else
              writeFile(name, content, (err2) => {
                /* istanbul ignore if */
                if (err2) bail(err2)
                else finish()
              })
          })
        })

      if (!outputReport || !outputReport.filePath) {
        return
      }

      const content = await (outputReport.formatter
        ? (await loadFormatter(eslint, outputReport.formatter)).format(results)
        : formatter.format(results))

      let { filePath } = outputReport
      if (!isAbsolute(filePath)) {
        filePath = join(compiler.outputPath, filePath)
      }

      await save(filePath, content)
    }
  }
}

async function formatResults(
  formatter: ESLint.Formatter,
  results: { errors: ESLint.LintResult[]; warnings: ESLint.LintResult[] },
): Promise<{ errors?: ESLintError; warnings?: ESLintError }> {
  let errors
  let warnings
  if (results.warnings.length > 0) {
    warnings = new ESLintError(await formatter.format(results.warnings))
  }

  if (results.errors.length > 0) {
    errors = new ESLintError(await formatter.format(results.errors))
  }

  return {
    errors,
    warnings,
  }
}

function parseResults(
  options: Options,
  results: ESLint.LintResult[],
): { errors: ESLint.LintResult[]; warnings: ESLint.LintResult[] } {
  const errors: ESLint.LintResult[] = []

  const warnings: ESLint.LintResult[] = []

  results.forEach((file) => {
    if (fileHasErrors(file)) {
      const messages = file.messages.filter(
        (message) => options.emitError && message.severity === 2,
      )

      if (messages.length > 0) {
        errors.push({ ...file, messages })
      }
    }

    if (fileHasWarnings(file)) {
      const messages = file.messages.filter(
        (message) => options.emitWarning && message.severity === 1,
      )

      if (messages.length > 0) {
        warnings.push({ ...file, messages })
      }
    }
  })

  return {
    errors,
    warnings,
  }
}

function fileHasErrors(file: ESLint.LintResult) {
  return file.errorCount > 0
}

function fileHasWarnings(file: ESLint.LintResult) {
  return file.warningCount > 0
}

async function loadFormatter(
  eslint: ESLint,
  formatter?: string | FormatterFunction,
): Promise<ESLint.Formatter> {
  if (typeof formatter === 'function') {
    return { format: formatter }
  }

  if (typeof formatter === 'string') {
    try {
      return eslint.loadFormatter(formatter)
    } catch (_) {
      // Load the default formatter.
    }
  }

  return eslint.loadFormatter()
}

async function removeIgnoredWarnings(
  eslint: ESLint,
  results: ESLint.LintResult[],
): Promise<ESLint.LintResult[]> {
  const filterPromises = results.map(async (result) => {
    // Short circuit the call to isPathIgnored.
    //   fatal is false for ignored file warnings.
    //   ruleId is unset for internal ESLint errors.
    //   line is unset for warnings not involving file contents.
    const { messages, warningCount, errorCount, filePath } = result
    const [firstMessage] = messages
    const hasWarning = warningCount === 1 && errorCount === 0
    const ignored =
      messages.length === 0 ||
      (hasWarning &&
        !firstMessage.fatal &&
        !firstMessage.ruleId &&
        !firstMessage.line &&
        (await eslint.isPathIgnored(filePath)))
    return ignored ? false : result
  })

  // @ts-ignore
  return (await Promise.all(filterPromises)).filter(Boolean)
}

/**
 * @param {Promise<LintResult[]>[]} results
 * @returns {Promise<LintResult[]>}
 */
async function flatten(
  results: Promise<ESLint.LintResult[]>[],
): Promise<ESLint.LintResult[]> {
  const flat = (acc: ESLint.LintResult[], list: ESLint.LintResult[]) => [
    ...acc,
    ...list,
  ]
  return (await Promise.all(results)).reduce(flat, [])
}

function getResultStorage({ compiler }: Compilation): LintResultMap {
  let storage = resultStorage.get(compiler)
  if (!storage) {
    resultStorage.set(compiler, (storage = {}))
  }
  return storage
}
