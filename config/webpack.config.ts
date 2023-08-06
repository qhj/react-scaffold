import path from 'node:path'
import webpack from 'webpack'
// import ESLintWebpackPlugin from 'eslint-webpack-plugin'
import ESLintWebpackPlugin from '../tools/eslint-webpack-plugin'
import HtmlPlugin from 'html-webpack-plugin'
import ReactRefreshPlugin from '@pmmmwh/react-refresh-webpack-plugin'
import 'webpack-dev-server'

const cssLoaders = () => {
  return [
    'style-loader',
    'css-loader',
    {
      loader: 'postcss-loader',
      options: {
        postcssOptions: {
          plugins: ['postcss-preset-env'],
        },
      },
    },
  ]
}

const projectRoot = path.resolve(__dirname, '../..')

const config: webpack.Configuration = {
  mode: 'development',
  entry: './src/main.tsx', // Path starting with a name wiil be resolved within node_modules
  output: {
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
    assetModuleFilename: 'assets/[hash][ext]',
  },
  module: {
    rules: [
      // css
      {
        test: /\.css$/,
        use: [...cssLoaders()],
      },
      // less
      {
        test: /\.less$/,
        use: [...cssLoaders(), 'less-loader'],
      },
      // sass
      {
        test: /\.s[ac]ss$/,
        use: [...cssLoaders(), 'sass-loader'],
      },
      // stylus
      {
        test: /\.styl$/,
        use: [...cssLoaders(), 'stylus-loader'],
      },
      {
        test: /\.tsx?/,
        // include: path.join(projectRoot, 'src'),
        loader: 'babel-loader',
        options: {
          presets: [['react-app', { runtime: 'automatic' }]],
          cacheDirectory: '.cache/babel-loader/',
          cacheCompression: false,
          plugins: ['react-refresh/babel'],
        },
      },
      // images
      {
        test: /\.(png|jpe?g|gif|webp|svg)$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 10 * 1024, // 10 KiB
          },
        },
      },
      // font
      {
        test: /\.(woff2?|[ot]tf)$/,
        type: 'asset/resource',
      },
    ],
  },
  // Must include the .js extension. See https://github.com/webpack/webpack-dev-server/issues/4552#issuecomment-1537832371
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  plugins: [
    new ESLintWebpackPlugin({
      context: projectRoot,
      extensions: ['ts', 'tsx'],
      emitWarning: true,
      failOnWarning: true,
      // cacheLocation: path.join(projectRoot, '.cache/eslint-webpack-plugin'),
    }),
    new HtmlPlugin({
      template: path.join(projectRoot, 'src/index.html'),
    }),
    new ReactRefreshPlugin(),
  ],
  devtool: 'eval-cheap-module-source-map',
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
    runtimeChunk: 'multiple',
  },
  devServer: {
    host: 'localhost',
    port: 3000,
    hot: true,
    historyApiFallback: true,
  },
}

export default config
