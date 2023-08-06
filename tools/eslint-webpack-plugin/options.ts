import { ESLint } from 'eslint'
import { z } from 'zod'

// `Partial<Type>` is for code completion
// `Inferred` is type of argument passed to function inferred by TypeScript
// the type annotation of parameter must be intersection of `ExactPartial` and the generic type
// for example:
// function<T>(options: T & ExactPartial<OneSpecificType, T>)
export type ExactPartial<Type, Inferred> = Partial<Type> & {
  [Key in keyof Inferred]: Key extends keyof Type
    ? undefined extends Inferred[Key]
      ? never
      : Type[Key]
    : never
}

// function<T>(options: ExactPartial<OneSpecificType, T>)
// type ExactPartial2<Type, Inferred> = Partial<Type> & {
//   [Key in keyof Inferred]: Key extends keyof Required<Type>
//     ? Required<Type>[Key]  // must ensure all propeties are required
//     : never
// }

const FormatterFunctionSchema = z
  .function()
  .args(
    z.custom<ESLint.LintResult>().array(), // results
    z.custom<ESLint.LintResultData>().optional(), // data
  )
  .returns(z.string())

export type FormatterFunction = z.infer<typeof FormatterFunctionSchema>

const OutputReportSchema = z.object({
  filePath: z.string().optional(),
  formatter: z.union([z.string(), FormatterFunctionSchema]).optional(),
})

const RegExpSchema = z.instanceof(RegExp)

const PluginOptionsSchema = z
  .object({
    context: z.string(),
    emitError: z.boolean(),
    emitWarning: z.boolean(),
    eslintPath: z.string(),
    exclude: z.union([z.string(), z.string().array()]),
    extensions: z.union([z.string(), z.string().array()]),
    failOnError: z.boolean(),
    failOnWarning: z.boolean(),
    files: z.union([z.string(), z.string().array()]),
    fix: z.boolean(),
    formatter: z.union([z.string(), FormatterFunctionSchema]),
    lintDirtyModulesOnly: z.boolean(),
    quiet: z.boolean(),
    outputReport: OutputReportSchema,
    threads: z.union([z.number(), z.boolean()]),
    resourceQueryExclude: z.union([RegExpSchema, RegExpSchema.array()]),
  })
  .partial()

export type PluginOptions = z.infer<typeof PluginOptionsSchema>

export type Options = PluginOptions & ESLint.Options

export function getOptions<T>(
  pluginOptions: T & ExactPartial<Options, T>,
): PluginOptions {
  const defaults = {
    cache: true,
    cacheLocation: '.cache/eslint-webpack-plugin',
    extensions: 'js',
    emitError: true,
    emitWarning: true,
    failOnError: true,
    resourceQueryExclude: [],
  }
  const options = {
    ...defaults,
    ...pluginOptions,
    ...(pluginOptions.quiet ? { emitError: true, emitWarning: false } : {}),
  }

  PluginOptionsSchema.parse(options)

  return options
}

export function getESLintOptions(loaderOptions: Options): ESLint.Options {
  const eslintOptions = { ...loaderOptions }

  // Keep the fix option because it is common to both the loader and ESLint.
  const { fix, extensions, ...eslintOnlyOptions } = PluginOptionsSchema.shape

  for (const option in eslintOnlyOptions) {
    delete eslintOptions[option as keyof typeof eslintOptions]
  }

  return eslintOptions
}
