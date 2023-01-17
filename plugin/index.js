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
const { translateTo } = require('../translate/index.js')
const fs = require('fs')
const { resolve } = require('path')

let once = false // 记录是否首次构建完成

const createFile = (content, path, filename) => {
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
    createFile(content, path, filename)
}

/**
 * Create the language config sourcemap
 * @param {Object} param0 
 */
const createSourceMap = ({path, filename}) => {
    let mapSource = getResource()
    mapSource = JSON.stringify(mapSource)
    createFile(mapSource, path, filename)
}

/**
 * 生成翻译词条配置文件
 * @param {String} param0 path - 生成文件的路径。若插件实例中未设置，则采用全局配置文件中的设置
 * @param {Array} param1 lang - 指定翻译的语言。若插件实例中未设置，则采用全局配置文件中的设置
 * @param {Function} param3 nameRule - 生成文件的名字规则，参数为lang具体元素。若插件实例中未设置，则采用全局配置文件中的设置
 */
const createTranslate = ({
    path = globalSettingTranslate.path,
    lang = globalSettingTranslate.lang,
    nameRule = globalSettingTranslate.nameRule
}) => {
    console.log('🚀 ~ file: index.js:69 ~ nameRule', nameRule);
    console.log('🚀 ~ file: index.js:69 ~ globalSettingTranslate', globalSettingTranslate);
    console.log('🚀 ~ file: index.js:69 ~ typeof nameRule', globalSettingTranslate.nameRule);
    const localeConfig = createConfigbyMap()
    // 根据每个翻译语言生成对应的翻译文件
    lang.forEach(item => {
        const fileName = nameRule(item)
        const filePath = path + '/' + fileName
        fs.access(filePath, fs.constants.F_OK, err => {
            let translateWords = [] // 等待翻译的词条
            let translateKeys = [] // 等待翻译的词条对应的key
            // 若不存在
            if (err) {
                for (const key in localeConfig) {
                    translateWords.push(localeConfig[key])
                    translateKeys.push(key)
                }
            } else {
                const langConfig = require(filePath)
                const deletedKeys = Object.keys(langConfig).filter(key => !Object.keys(localeConfig).some(localeKey => localeKey === key))
                deletedKeys.forEach(key => {
                    delete langConfig[key]
                })
                for (const key in localeConfig) {
                    if (!langConfig[key]) {
                        translateWords.push(localeConfig[key])
                        translateKeys.push(key)
                    }
                }
            }
            const translateRes = translateTo(translateWords)
            translateKeys.forEach((key, index) => {
                langConfig[key] = translateRes[index]
            })
            createFile(JSON.stringify(langConfig), path, fileName)
        })
        
    })
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

        // ==== 生成翻译词条配置文件 ====
        // 若new插件时设置了on，则根据插件实例的设置来
        if (translate.on != null) {
            translate.on && createTranslate(translate)
        // 否则根据全局配置文件的设置来
        } else if (globalSettingTranslate.on) {
            createTranslate(translate)
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

        complier.plugin('invalid', (fileName, changeTime) => {
            console.log('====== invalid')
            console.log('🚀 ~ file: index.js:147 ~ I18nConfigPlugin ~ complier.plugin ~ changeTime', changeTime);
            console.log('🚀 ~ file: index.js:147 ~ I18nConfigPlugin ~ complier.plugin ~ fileName', fileName);
        })

        complier.plugin('done', (stats) => {
            console.log('🚀 ~ file: plugin.js ~ line 88 ~ I18nConfigPlugin ~ complier.plugin ~ done')

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
}

module.exports = I18nConfigPlugin
