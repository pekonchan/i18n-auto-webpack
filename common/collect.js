const rootPath = process.cwd()
const { resolve } = require('path')

let globalSetting = {}
let localeWordConfig = {}
const resourceMap = {}
let currentCompileResourceMap = {}
let compiledFiles = []
let firstCompileDone = false

/**
 * Initialize
 */
function init () {
    const defaultFile = {
        filename: 'zh.json',
        path: resolve(rootPath, './lang')
    }
    const defaultSetting = {
        entry: { ...defaultFile },
        output: { ...defaultFile },
        localePattern: /[\u4e00-\u9fa5]/, // chinese
        keyRule: null,
        translate: {
            on: false,
            lang: ['en'],
            path: defaultFile.path,
            nameRule (lang) {
                return `${lang}.json`
            },
            startTotal: 0,
            endTotal: 5000000,
            secretId: '', // If translate on, secretId is required
            secretKey: '', // If translate on, secretKey is required
            region: 'ap-beijing',
            endpoint: 'tmt.tencentcloudapi.com',
            source: 'zh',
            projectId: 0
        }
    }

    try {
        const setting = require(rootPath + '/i18nauto.config.js')
        if (setting.entry && !setting.output) {
            Object.assign(defaultSetting.output, setting.entry)
        }
        for (const key in defaultSetting) {
            if (!setting[key]) {
                continue
            }
            const value = defaultSetting[key]
            if (value && value.constructor === Object) {
                Object.assign(defaultSetting[key], setting[key])
            } else {
                defaultSetting[key] = setting[key]
            }
        }
        // 如果设置开启翻译，且 没指定生成翻译文件的地址，则保持跟output的地址一致
        if (defaultSetting.translate.on && !setting.translate.path) {
            defaultSetting.translate.path = defaultSetting.output.path
        }
    } catch (e) {
        console.warn('Lack of "i18nauto.config.js" file, use the default config...')
    }
    globalSetting = defaultSetting

    const {path: entryPath, filename} = globalSetting.entry
    const entryFile = resolve(entryPath, filename)
    globalSetting.entryFile = entryFile
    
    try {
        const exsitConfig = require(entryFile)
        for (const key in exsitConfig) {
            if (!Object.prototype.hasOwnProperty.call(exsitConfig, key)) {
                return
            }
            localeWordConfig[key] = exsitConfig[key]
        }
    } catch (e) {
        console.error('There is no locale keyword file ' + entryFile)
    }
}
init()

const addConfig = (key, value) => {
    if (localeWordConfig[key]) {
        return addConfig(++key, value)
    } else {
        localeWordConfig[key] = value
        return key + ''
    }
}

/**
 * Default rule to set the key for new word
 * @returns 
 */
const defaultKeyRule = (value) => {
    const max = (Object.keys(localeWordConfig).sort((a,b) => b-a))[0]
    let isAdded = false
    for (let i = 0; i < max; i++) {
        if (!localeWordConfig[i]) {
            localeWordConfig[i] = value
            isAdded = true
            currentKey = (i + '')
            break
        }
    }
    if (isAdded) {
        return currentKey
    } else {
        const len = Object.keys(localeWordConfig).length
        return addConfig(len, value)
    }
}

const setConfig = (value) => {
    let currentKey = getKey(value)
    if (currentKey) {
        return currentKey
    } else {
        if (globalSetting.keyRule) {
            const newKey = globalSetting.keyRule(value, localeWordConfig)
            localeWordConfig[newKey] = value
            return newKey
        } else {
            return defaultKeyRule(value)
        }
    }
}

const updateConfig = (value) => {
    localeWordConfig = value
}

const getKey = (value) => {
    let currentKey = null
    for (const k in localeWordConfig) {
        if (!Object.prototype.hasOwnProperty.call(localeWordConfig, k)) {
            return
        }
        if (localeWordConfig[k] === value) {
            currentKey = k
            break
        }
    }
    return currentKey
}

const setCurrentCompileResourceMap = (path, collection, keyInCodes) => {
    let config = {}
    if (keyInCodes.length) {
        keyInCodes.forEach(key => {
            if (!localeWordConfig[key]) {
                return
            }
            if (!config[key]) {
                config[key] = {
                    value: localeWordConfig[key],
                    count: 1
                }
            } else {
                config[key].count++
            }
        })
    } else if (collection.length === 0 && !firstCompileDone) {
        return
    }
    
    collection.forEach(item => {
        const key = Object.keys(item)[0]
        const val = item[key]
        if (!config[key]) {
            config[key] = {
                value: val,
                count: 1
            }
        } else if (config[key].value === val) {
            config[key].count++
        }
    })
    if (compiledFiles.includes(path)) {
        const temp = currentCompileResourceMap[path] || {}
        for (const key in temp) {
            if (config[key]) {
                config[key].count += temp[key].count
            } else {
                config[key] = temp[key]
            }
        }
    }
    currentCompileResourceMap[path] = config
}
const updateResourceMap = () => {
    let configNeedUpdate = false
    let sourceMapNeedUpdate = false
    
    for (const path in currentCompileResourceMap) {
        const newPathtMap = currentCompileResourceMap[path]
        const lastPathMap = resourceMap[path]

        if (!configNeedUpdate && firstCompileDone) {
            const newKeys = Object.keys(newPathtMap)
            const oldKeys = lastPathMap ? Object.keys(lastPathMap) : []
            if ((newKeys.length !== oldKeys.length) || (oldKeys.join('+') !== newKeys.join('+'))) {
                configNeedUpdate = true
                sourceMapNeedUpdate = true
            } else {
                for (const key in newPathtMap) {
                    if (newPathtMap[key].count !== lastPathMap[key].count) {
                        sourceMapNeedUpdate = true
                        break
                    }
                }
            }
        }

        if (JSON.stringify(newPathtMap) === '{}') {
            if (lastPathMap) {
                delete resourceMap[path]
            }
        } else {
            resourceMap[path] = newPathtMap
        }
    }
    currentCompileResourceMap = {}
    
    if (!firstCompileDone) {
        const newConfig = createConfigbyMap()
        let oldConfig = {}
        try {
            oldConfig = require(globalSetting.entryFile)
            if (Object.keys(newConfig).length !== Object.keys(oldConfig).length) {
                configNeedUpdate = true
            } else {
                for (const key in newConfig) {
                    if (newConfig[key].value !== oldConfig[key]) {
                        configNeedUpdate = true
                        break
                    }
                }
            }
        } catch (e) {
            configNeedUpdate = true
        }
        sourceMapNeedUpdate = true
    }

    return {
        configNeedUpdate,
        sourceMapNeedUpdate,
    }
}

const getResource = (path) => {
    if (path) {
        const pathConfig = resourceMap[path]
        if (pathConfig) {
            return JSON.parse(JSON.stringify(pathConfig))
        } else {
            return {}
        }
    } else {
        return JSON.parse(JSON.stringify(resourceMap))
    }
}

const addCompiledFiles = (path) => {
    compiledFiles.includes(path) || compiledFiles.push(path)
}

const getCompiledFiles = (resourcePath) => {
    return resourcePath ? compiledFiles.includes(resourcePath) : compiledFiles.concat()
}

const setCompiledFiles = (val) => {
    compiledFiles = val
}

const setCompileDone = (val) => {
    firstCompileDone = val
}

const getCompileDone = () => {
    return firstCompileDone
}

const createConfigbyMap = () => {
    let config = {}
    for (const path in resourceMap) {
        for (const key in resourceMap[path]) {
            const thisMap = resourceMap[path]
            if (!config[key]) {
                config[key] = JSON.parse(JSON.stringify(thisMap[key]))
            } else if (config[key].value === thisMap[key].value) {
                config[key].count += thisMap[key].count
            }
        }
    }
    return config
}

module.exports = {
    globalSetting,
    setConfig,
    setCurrentCompileResourceMap,
    updateResourceMap,
    getResource,
    addCompiledFiles,
    setCompiledFiles,
    getKey,
    setCompileDone,
    getCompileDone,
    createConfigbyMap,
    updateConfig,
}
