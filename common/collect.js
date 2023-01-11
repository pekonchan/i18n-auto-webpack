const rootPath = process.cwd()
const { resolve } = require('path')

let config = {}
try {
    config = require(rootPath + '/i18nauto.config.js')
} catch (e) {
    console.warn('Lack of "i18nauto.config.js" file, use the default config...')
}
const {
    entry = resolve(rootPath, './lang'),
    output: {
        filename = 'zh.json',
        path = resolve(rootPath, './lang')
    } = {}
} = config || {}
const outputPath = resolve(path, filename)

let zhConfig = {} // 存中文词条的key value count情况配置表
try {
    const exsitConfig = require(entry)
    for (const key in exsitConfig) {
        if (!Object.prototype.hasOwnProperty.call(exsitConfig, key)) {
            return
        }
        zhConfig[key] = exsitConfig[key]
    }
} catch (e) {
    console.error(e)
}

const resourceMap = {} // 记录文件各词条情况映射表
let currentCompileResourceMap = {} // 记录本次编译过程中涉及到的文件的词条映射表，最终在编译完成后将此份资料update到上面的resourceMap里。因为resourceMap在编译过程中loader里需要不断用来做历史备份数据的比对，所以不能在编译过程中实时update

let compiledFiles = [] // 本次编译中，编译过的文件路径集合。等本次编译完成，会被清空

let firstCompileDone = false // 开发环境下，是否已经完成了初次的编译，即启动服务时的第一次编译；生产环境下就是第一次编译（本身就只有一次编译）

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
        const max = (Object.keys(zhConfig).sort((a,b) => b-a))[0]
        let isAdded = false
        for (let i = 0; i < max; i++) {
            if (!zhConfig[i]) {
                zhConfig[i] = value
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
            const len = Object.keys(zhConfig).length
            return addConfig(len, value)
        }
    }
}

const addConfig = (key, value) => {
    if (zhConfig[key]) {
        return addConfig(++key, value)
    } else {
        zhConfig[key] = value
        return key
    }
}

const updateConfig = (value) => {
    zhConfig = value
}

/**
 * 根据词条值找对应的词条编号
 * @param {String} value 词条值
 * @returns Number 匹配到的词条编号，匹配不到则返回null
 */
const getKey = (value) => {
    let currentKey = null
    // 找出当前设置的词条是否已经存在
    for (const k in zhConfig) {
        if (!Object.prototype.hasOwnProperty.call(zhConfig, k)) {
            return
        }
        if (zhConfig[k] === value) {
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
    // 同一个编译流程中，可能多次执行了同一个文件的loader，一个文件的不同部分执行了同一个loader，那么把多次执行收集到的词条信息整理一起；若没有则直接赋值
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
    // 统一更新本次编译收集到的映射信息
    for (const path in currentCompileResourceMap) {
        resourceMap[path] = currentCompileResourceMap[path]
    }
    currentCompileResourceMap = {}
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
    setConfig,
    setCurrentCompileResourceMap,
    updateResourceMap,
    getResource,
    output: {
        wholePath: outputPath,
        path,
        filename
    },
    addCompiledFiles,
    setCompiledFiles,
    getKey,
    setCompileDone,
    getCompileDone,
    createConfigbyMap,
    updateConfig,
}
