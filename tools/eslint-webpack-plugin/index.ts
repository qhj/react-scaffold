import { join, isAbsolute } from 'node:path'
import { Compiler, Module, NormalModule } from 'webpack'
import { isMatch } from 'micromatch'
import { WebpackError } from 'webpack'

import { getOptions } from './options'
import type { ExactPartial, Options, PluginOptions } from './options'
import { toArray, parseFiles, parseFoldersToGlobs } from './utils'

import { linter } from './linter'
import type { Linter, Reporter } from './linter'

const ESLINT_PLUGIN = 'ESLintWebpackPlugin'
const DEFAULT_FOLDER_TO_EXCLUDE = '**/node_modules/**'

let compilerId = 0

class ESLintWebpackPlugin<T> {
  key: string
  options: PluginOptions

  constructor(options: T & ExactPartial<Options, T>) {
    this.key = ESLINT_PLUGIN
    this.options = getOptions(options)
    this.run = this.run.bind(this)
  }

  apply(compiler: Compiler) {
    // Generate key for each compilation,
    // this differentiates one from the other when being cached.
    this.key = compiler.name || `${this.key}_${(compilerId += 1)}`

    const excludedFiles = parseFiles(
      this.options.exclude || [],
      this.getContext(compiler),
    )
    const resourceQueries = toArray(this.options.resourceQueryExclude || [])
    const excludedResourceQueries = resourceQueries.map((item) =>
      item instanceof RegExp ? item : new RegExp(item),
    )

    const options = {
      ...this.options,
      exclude: excludedFiles,
      resourceQueryExclude: excludedResourceQueries,
      extensions: toArray(this.options.extensions),
      files: parseFiles(this.options.files || '', this.getContext(compiler)),
    }

    const foldersToExclude = this.options.exclude
      ? options.exclude
      : DEFAULT_FOLDER_TO_EXCLUDE
    const exclude = parseFoldersToGlobs(foldersToExclude)
    const wanted = parseFoldersToGlobs(options.files, options.extensions)

    // If `lintDirtyModulesOnly` is disabled,
    // execute the linter on the build
    if (!this.options.lintDirtyModulesOnly) {
      compiler.hooks.run.tapPromise(this.key, (c) =>
        this.run(c, options, wanted, exclude),
      )
    }

    let hasCompilerRunByDirtyModule = this.options.lintDirtyModulesOnly

    compiler.hooks.watchRun.tapPromise(this.key, (c) => {
      if (!hasCompilerRunByDirtyModule)
        return this.run(c, options, wanted, exclude)

      hasCompilerRunByDirtyModule = false

      return Promise.resolve()
    })
  }

  /**
   * @param {Compiler} compiler
   * @param {Omit<Options, 'resourceQueryExclude'> & {resourceQueryExclude: RegExp[]}} options
   * @param {string[]} wanted
   * @param {string[]} exclude
   */
  async run(
    compiler: Compiler,
    options: Omit<Options, 'resourceQueryExclude'> & {
      resourceQueryExclude: RegExp[]
    },
    wanted: string[],
    exclude: string[],
  ) {
    // @ts-ignore
    const isCompilerHooked = compiler.hooks.compilation.taps.find(
      ({ name }) => name === this.key,
    )

    if (isCompilerHooked) return

    compiler.hooks.compilation.tap(this.key, (compilation) => {
      let lint: Linter
      let report: Reporter
      let threads: number

      try {
        ;({ lint, report, threads } = linter(this.key, options, compilation))
      } catch (e) {
        compilation.errors.push(e as WebpackError)
        return
      }

      const files: string[] = []

      // Add the file to be linted
      compilation.hooks.succeedModule.tap(this.key, addFile)
      compilation.hooks.stillValidModule.tap(this.key, addFile)

      function addFile(module: Module) {
        const { resource } = <NormalModule>module

        if (!resource) return

        const [file, query] = resource.split('?')
        const isFileNotListed = file && !files.includes(file)
        const isFileWanted =
          isMatch(file, wanted, { dot: true }) &&
          !isMatch(file, exclude, { dot: true })
        const isQueryNotExclude = options.resourceQueryExclude.every(
          (reg) => !reg.test(query),
        )

        if (isFileNotListed && isFileWanted && isQueryNotExclude) {
          files.push(file)

          if (threads > 1) lint(file)
        }
      }

      // Lint all files added
      compilation.hooks.finishModules.tap(this.key, () => {
        if (files.length > 0 && threads <= 1) lint(files)
      })

      // await and interpret results
      compilation.hooks.additionalAssets.tapPromise(this.key, processResults)

      async function processResults() {
        const { errors, warnings, generateReportAsset } = await report()

        if (warnings && !options.failOnWarning) {
          // @ts-ignore
          compilation.warnings.push(warnings)
        } else if (warnings) {
          // @ts-ignore
          compilation.errors.push(warnings)
        }

        if (errors && !options.failOnError) {
          // @ts-ignore
          compilation.warnings.push(errors)
        } else if (errors) {
          // @ts-ignore
          compilation.errors.push(errors)
        }

        if (generateReportAsset) await generateReportAsset(compilation)
      }
    })
  }

  getContext(compiler: Compiler) {
    const compilerContext = String(compiler.options.context)
    const optionContext = this.options.context

    if (!optionContext) return compilerContext

    if (isAbsolute(optionContext)) return optionContext

    return join(compilerContext, optionContext)
  }
}

export default ESLintWebpackPlugin
