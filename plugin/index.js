const {
    output: globalSettingOutput,
    getResource,
    setCompileDone,
    setCompiledFiles,
    updateResourceMap,
    createConfigbyMap,
    updateConfig,
} = require('../common/collect')
const fs = require('fs')
const { resolve } = require('path')

/**
 * Create language config
 * @param {Object} output
 */
const createConfig = (output) => {
    const zhConfig = createConfigbyMap()
    const { path, filename } = output || globalSettingOutput
    let content = {}
    for (const key in zhConfig) {
        if (Object.prototype.hasOwnProperty.call(zhConfig, key)) {
            content[key] = zhConfig[key].value || ''
        }
    }
    updateConfig(content)
    content = JSON.stringify(content)
    fs.mkdir(path, { recursive: true }, err => {
        if (err) {
            throw err
        }
        fs.writeFile(resolve(path, filename), content, err => {
            if (err) {
                return console.error(err)
            }
        })
    })
}

/**
 * Create the language config sourcemap
 * @param {Object} param0 
 */
const createSourceMap = ({path, filename}) => {
    let mapSource = getResource()
    mapSource = JSON.stringify(mapSource)
    fs.mkdir(path, { recursive: true }, err => {
        if (err) {
            throw err
        }
        fs.writeFile(resolve(path, filename), mapSource, err => {
            if (err) {
                return console.error(err)
            }
        })
    })
}

/**
 * The plugin emit job
 * @param {Object} output
 * @param {Object} sourceMap
 */
const createEmit = (output, sourceMap) => {
    const { need, config } = sourceMap
    createConfig(output)
    need && createSourceMap(config)
    isBuildConfig = true
}

let once = false
let isBuildConfig = false

class I18nConfigPlugin {
    constructor (options) {
        this.options = options
    }

    apply (complier) {
        const {
            output,
            watch,
            sourceMap,
            // impress = false
        } = this.options || {}

        // 监听模式下的设置
        let watchMode = false
        let watchImpact = false
        if (typeof watch === 'boolean') {
            watchMode = watch
        } else if (watch) {
            const { on, impact } = watch
            watchMode = !!on
            watchImpact = impact
        }

        // 溯源配置
        let needSourceMap = false
        let sourceMapConfig = {
            path: resolve(process.cwd(), './lang'),
            filename: 'zh.sourcemap.json'
        }
        if (typeof sourceMap === 'boolean') {
            needSourceMap = sourceMap
        } else if (sourceMap) {
            const { on, path, filename } = sourceMap
            needSourceMap = !!on
            path && (sourceMapConfig.path = path)
            filename && (sourceMapConfig.filename = filename)
        }

        complier.plugin('done', (stats) => {
            console.log('🚀 ~ file: plugin.js ~ line 88 ~ I18nConfigPlugin ~ complier.plugin ~ done')

            // 第一次启动工程就生成配置文件
            if (!once) {
                updateResourceMap()
                setCompiledFiles([])
                setCompileDone(true)
                createEmit(output, {
                    need: needSourceMap,
                    config: sourceMapConfig
                })
                once = true
            // 如果开通监听模式
            } else if (watchMode) {
                // 是改了配置文件引起的重新构建
                if (watchImpact && isBuildConfig) {
                    isBuildConfig = false
                    return
                } else {
                    updateResourceMap()
                    setCompiledFiles([])
                    createEmit(output, {
                        need: needSourceMap,
                        config: sourceMapConfig
                    })
                }
            }
        })
    }
}

module.exports = I18nConfigPlugin
