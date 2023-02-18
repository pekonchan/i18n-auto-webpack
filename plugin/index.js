const {
    globalSetting,
    getResource,
    setCompileDone,
    setCompiledFiles,
    updateResourceMap,
    createConfigbyMap,
    updateConfig,
} = require('../common/collect')
const {
    translate: globalSettingTranslate
} = globalSetting
const { createFile } = require('../common/utils')
const { createTranslate } = require('../translate/index.js')
const { resolve } = require('path')

let once = false // 记录是否首次构建完成
let translating = false // 是否正在翻译，因为翻译接口有请求1秒内请求次数限制，所以正在翻译的过程中不要再发翻译请求了

/**
 * Create language config
 * @param {Object} output
 */
const createConfig = (output) => {
    const localeWordConfig = createConfigbyMap()
    const { path, filename } = output || globalSetting.output
    let content = {}
    for (const key in localeWordConfig) {
        if (Object.prototype.hasOwnProperty.call(localeWordConfig, key)) {
            content[key] = localeWordConfig[key].value || ''
        }
    }
    updateConfig(content)
    content = JSON.stringify(content)
    createFile({content, path, filename})
}

/**
 * Create the language config sourcemap
 * @param {Object} param0 
 */
const createSourceMap = ({path, filename}) => {
    let mapSource = getResource()
    mapSource = JSON.stringify(mapSource)
    createFile({content: mapSource, path, filename})
}

/**
 * 生成翻译词条配置文件
 */
const handleTranslate = async (translation) => {
    const localeConfigOrigin = createConfigbyMap()
    // 格式化词条配置，转成{key: value}格式
    const localeConfig = {}
    for (const key in localeConfigOrigin) {
        localeConfig[key] = localeConfigOrigin[key].value
    }
    translating = true
    try {
        await createTranslate(translation, {text: localeConfig})
    } catch (e) {}
    translating = false
}

/**
 * The plugin emit job
 * @param {Object} output
 * @param {Object} sourceMap
 * @param {Boolean} fileChange - Wether the file should update
 */
const createEmit = ({output, sourceMap, translate}, fileChange) => {
    const {
        configNeedUpdate,
        sourceMapNeedUpdate,
    } = fileChange
    // 需要更新词条时（词条发生了变化）
    if (configNeedUpdate) {
        // ==== 生成词条配置文件 ====
        createConfig(output)
    }

    // ==== 生成翻译词条配置文件 ====
    // 若new插件时设置了on，则根据插件实例的设置来
    // 已经有在翻译中的，就不要再进行新一轮的翻译工作了（翻译接口限制，无奈之举，无法做到实时翻译）
    if (!translating) {
        if (translate.on != null) {
            translate.on && handleTranslate(translate)
        // 否则根据全局配置文件的设置来
        } else if (globalSettingTranslate.on) {
            handleTranslate(translate)
        }
    }
    
    // ==== 生成映射关系文件 ====
    // 若设置了生成映射文件 且 需要更新时才 生成/更新 映射文件
    if (sourceMap.on && sourceMapNeedUpdate) {
        createSourceMap({
            path: sourceMap.path,
            filename: sourceMap.filename
        })
    }
}
class I18nConfigPlugin {
    constructor (options) {
        this.options = options
    }

    apply (complier) {
        const {
            output,
            watch,
            sourceMap,
            translate,
        } = this.initOption()

        this.hook(complier, 'done', 'tap', () => {
            const handleData = () => {
                const fileChange = updateResourceMap()
                setCompiledFiles([])
                setCompileDone(true)
                createEmit({
                    output,
                    sourceMap,
                    translate
                }, fileChange)
            }

            // 第一次启动工程就生成配置文件
            if (!once) {
                handleData()
                once = true
            // 如果开通监听模式
            } else if (watch.on) {
                handleData()
            }
        })
    }

    initOption () {
        const {
            output,
            watch,
            sourceMap,
            translate,
            // impress = false
        } = this.options || {}

        // 监听模式下的设置
        let watchConfig = {
            on: false,
        }
        if (typeof watch === 'boolean') {
            watchConfig.on = watch
        } else if (watch) {
            const { on } = watch
            watchConfig.on = !!on
        }

        // 溯源配置
        let sourceMapConfig = {
            on: false,
            path: resolve(process.cwd(), './lang'),
            filename: 'zh.sourcemap.json'
        }
        if (typeof sourceMap === 'boolean') {
            sourceMapConfig.on = sourceMap
        } else if (sourceMap) {
            const { on, path, filename } = sourceMap
            sourceMapConfig.on = !!on
            path && (sourceMapConfig.path = path)
            filename && (sourceMapConfig.filename = filename)
        }

        // 翻译配置
        let translateConfig = {}
        if (typeof translate === 'boolean') {
            translateConfig.on = translate
        } else if (translate) {
            for (const setting in translate) {
                translateConfig[setting] = translate[setting]
            }
        }

        return {
            output,
            watch: watchConfig,
            sourceMap: sourceMapConfig,
            translate: translateConfig,
        }
    }

    /**
     * 兼容新版webpack和旧版的 订阅方法
     * @param {Object} target 使用钩子的对象，如compiler compliation
     * @param {String} name 钩子名字
     * @param {String} method hook的订阅方法
     * @param {Function} cb 回调函数
     */
    hook (target, name, method, cb) {
        if (target.hooks) {
            target.hooks[name][method]('i18nAutoPlugin', cb)
        } else {
            target.plugin(name, cb)
        }
    }
}

module.exports = I18nConfigPlugin
