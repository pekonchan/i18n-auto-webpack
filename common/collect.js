const rootPath = process.cwd()
const { resolve } = require('path')

let globalSetting = {}
let localeWordConfig = {} // 存需要国际化的词条的key value情况配置表
const resourceMap = {} // 记录文件各词条情况映射表
let currentCompileResourceMap = {} // 记录本次编译过程中涉及到的文件的词条映射表，最终在编译完成后将此份资料update到上面的resourceMap里。因为resourceMap在编译过程中loader里需要不断用来做历史备份数据的比对，所以不能在编译过程中实时update
let compiledFiles = [] // 本次编译中，编译过的文件路径集合。等本次编译完成，会被清空
let firstCompileDone = false // 开发环境下，是否已经完成了初次的编译，即启动服务时的第一次编译；生产环境下就是第一次编译（本身就只有一次编译）

/**
 * Initialize
 */
function init () {
    // 默认设置
    const defaultSetting = {
        entry: resolve(rootPath, './lang/zh.json'),
        output: {
            filename: 'zh.json',
            path: resolve(rootPath, './lang')
        },
        translate: {
            on: false, // 是否开启翻译
            lang: ['en'], // 要翻译成哪些语言
            path: resolve(process.cwd(), './lang'), // 生成的翻译文件所在目录
            nameRule (lang) { // 生成的翻译文件名
                return `${lang}.json`
            },
            // 以下字段对标腾讯云的机器翻译说明，腾讯云机器翻译接口所需 https://cloud.tencent.com/document/api/551/40566
            // 且以下字段只能设置全局配置文件i18nauto.config.js中，不能设置在插件实例options中
            region: 'ap-beijing', // 对哪个地区的语言进行翻译
            endpoint: 'tmt.tencentcloudapi.com', // 接口请求地址
            source: 'zh', // 要进行翻译的语言
            projectId: 0 // 项目ID，可以根据控制台-账号中心-项目管理中的配置填写，如无配置请填写默认项目ID:0
        }
    }

    // 读取全局配置文件i18nauto.config.js，把里面用户设置的内容跟默认设置进行合并
    try {
        const setting = require(rootPath + '/i18nauto.config.js')
        for (const key in defaultSetting) {
            if (!setting[key]) {
                return
            }
            const value = defaultSetting[key]
            if (value && value.constructor === Object) {
                Object.assign(defaultSetting[key], setting[key])
            } else {
                defaultSetting[key] = setting[key]
            }
        }
        globalSetting = defaultSetting
    } catch (e) {
        console.warn('Lack of "i18nauto.config.js" file, use the default config...')
    }
    
    // 根据已有词条配置表初始化本地词条配置变量
    try {
        const exsitConfig = require(globalSetting.entry)
        for (const key in exsitConfig) {
            if (!Object.prototype.hasOwnProperty.call(exsitConfig, key)) {
                return
            }
            localeWordConfig[key] = exsitConfig[key]
        }
    } catch (e) {
        console.error(e)
    }
}
init()

/**
 * 设置词条
 * @param {String} value 词条
 * @returns {String} 编号
 */
const setConfig = (value) => {
    let currentKey = getKey(value) // 找出当前设置的词条是否已经存在
    // 已存在
    if (currentKey) {
        return currentKey
    // 不存在，插入一条新词条
    } else {
        // 找出当前词条中是否有可以空补的词条编号
        const max = (Object.keys(localeWordConfig).sort((a,b) => b-a))[0]
        let isAdded = false
        for (let i = 0; i < max; i++) {
            if (!localeWordConfig[i]) {
                localeWordConfig[i] = value
                isAdded = true
                currentKey = i
                break
            }
        }
        // 已经在空缺的编号处补上了
        if (isAdded) {
            return currentKey
        } else {
            // 无空补的，新增编号
            const len = Object.keys(localeWordConfig).length
            return addConfig(len, value)
        }
    }
}

const addConfig = (key, value) => {
    if (localeWordConfig[key]) {
        return addConfig(++key, value)
    } else {
        localeWordConfig[key] = value
        return key
    }
}

const updateConfig = (value) => {
    localeWordConfig = value
}

/**
 * 根据词条值找对应的词条编号
 * @param {String} value 词条值
 * @returns Number 匹配到的词条编号，匹配不到则返回null
 */
const getKey = (value) => {
    let currentKey = null
    // 找出当前设置的词条是否已经存在
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

/**
 * 设置当前编译文件词条配置映射文件
 * @param {String} path 编译文件路径
 * @param {Array} collection 收集到的词条配置
 */
const setCurrentCompileResourceMap = (path, collection) => {
    // 本次编译没词条 且 是初次编译
    if (collection.length === 0 && !firstCompileDone) {
        return
    }
    // 将数组形式的配置转换成对象形式，主要是数组形式里可能会有重复的词条配置，转成对象配置时去重，并加上count字段识别在该文件中出现多少次
    let config = {}
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
    // 同一个编译流程中，可能多次执行了同一个文件的loader，一个文件的不同部分执行了同一个loader，那么把多次执行收集到的词条信息整理一起
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
/**
 * 根据编译过程中收集到的词条信息更新到最终的映射表中
 */
const updateResourceMap = () => {
    let configNeedUpdate = false // 配置文件是否需要更新
    let sourceMapNeedUpdate = false // 映射文件是否需要更新
    
    // 统一更新本次编译收集到的映射信息
    for (const path in currentCompileResourceMap) {
        const newPathtMap = currentCompileResourceMap[path]
        const lastPathMap = resourceMap[path]

        // Start: 找出是否配置文件和映射文件需要更新
        // 若未检测出有变更（因为在循环里，避免重复执行无用功） 且 属于第一次编译后
        if (!configNeedUpdate && firstCompileDone) {
            const newKeys = Object.keys(newPathtMap)
            const oldKeys = lastPathMap ? Object.keys(lastPathMap) : []
            // 数量不等肯定为修改了的 或 新旧的key不一样也代表了修改了（该写法得益于修改某个key对应的词条，是视为新增操作，不直接改动原本key对应的value）
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
        // End

        // 若编译的文件里没找到词条（目前只有非首次启动构建时的编译才会有这种现象），发生这个现象有两个原因：
        // 1）已有文件里的词条都被删除了； 2）新增了一个文件，里面没有词条
        if (JSON.stringify(newPathtMap) === '{}') {
            // 这是第一种情况。已有文件里的词条都被删除了
            if (lastPathMap) {
                delete resourceMap[path]
            }
        } else {
            resourceMap[path] = newPathtMap
        }
    }
    currentCompileResourceMap = {}
    
    // 首次编译时，通过配置表判断是否有变更
    if (!firstCompileDone) {
        const newConfig = createConfigbyMap
        const oldConfig = localeWordConfig
        if (newConfig.length !== oldConfig.length) {
            configNeedUpdate = true
        } else {
            for (const key in newConfig) {
                if (newConfig[key] !== oldConfig[key]) {
                    configNeedUpdate = true
                    break
                }
            }
        }
        sourceMapNeedUpdate = true // 目前没有根据已有sourcemap文件来做相关处理。
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

/**
 * 添加编译过文件的记录
 * @param {String} path 文件绝对路径
 */
const addCompiledFiles = (path) => {
    compiledFiles.includes(path) || compiledFiles.push(path)
}
/**
 * 获取编译文件的记录
 * @param {String} resourcePath 指定查询对应文件路径是否有记录
 * @returns Boolean|Array 返回编译过文件的记录，指定文件路径情况下，返回Boolean告知存在与否；未指定文件路径下，返回全部编译记录集合
 */
const getCompiledFiles = (resourcePath) => {
    return resourcePath ? compiledFiles.includes(resourcePath) : compiledFiles.concat()
}
/**
 * 设置编译记录
 * @param {*} val 
 * @returns 
 */
const setCompiledFiles = (val) => {
    compiledFiles = val
}

/**
 * 设置firstCompileDone
 * @param {*} val 
 */
const setCompileDone = (val) => {
    firstCompileDone = val
}
/**
 * 读取firstCompileDone
 * @returns Boolean
 */
const getCompileDone = () => {
    return firstCompileDone
}

/**
 * 根据映射表生成最新的词条配置表
 * @returns Object 词条配置
 */
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
