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
        zhConfig[key] = {
            value: exsitConfig[key],
            count: 0 // 从已存在的配置文件中获取的话，除非是有生成map文件，不然都是为0，后续在loader编译时会根据实际情况得出真实的count值。  TODO：map文件的逻辑还没实现
        }
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
 * @param {String} resourcePath 词条所在文件路径
 * @returns {String} 编号
 */
const setConfig = (value, resourcePath) => {
    let currentKey = getKey(value) // 找出当前设置的词条是否已经存在
    // 已存在
    if (currentKey) {
        // 若初次编译 或 经过初次编译后对于当前文件是属于新加入的词条，计数+1
        const record = resourceMap[resourcePath] || {}
        if (!(Object.values(record).includes(value))) {
            zhConfig[currentKey].count++
        }
        return currentKey
    // 不存在，插入一条新词条
    } else {
        // 找出当前词条中是否有可以空补的词条编号
        const max = (Object.keys(zhConfig).sort((a,b) => b-a))[0]
        let isAdded = false
        for (let i = 0; i < max; i++) {
            if (!zhConfig[i]) {
                zhConfig[i] = {
                    value,
                    count: 1
                }
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
        zhConfig[key] = {
            value,
            count: 1
        }
        return key
    }
}

const editConfig = (key, value) => {
    zhConfig[key] = {
        value,
        count: 1
    }
}

const getConfig = () => {
    return JSON.parse(JSON.stringify(zhConfig))
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
        if (zhConfig[k].value === value) {
            currentKey = k
            break
        }
    }
    return currentKey
}

/**
 * 设置当前编译文件词条配置映射文件
 * @param {String} path 编译文件路径
 * @param {Object} config 词条配置
 */
const setCurrentCompileResourceMap = (path, config) => {
    // 同一个编译流程中，可能多次执行了同一个文件的loader，一个文件的不同部分执行了同一个loader，那么把多次执行收集到的词条信息整理一起；若没有则直接赋值
    const temp = currentCompileResourceMap[path] || {}
    currentCompileResourceMap[path] = compiledFiles.includes(path) ? {...temp, ...config} : config
}
/**
 * 根据编译过程中收集到的词条信息更新到最终的映射表中
 */
const updateResourceMap = () => {
    // 非初次编译
    if (firstCompileDone) {
        compiledFiles.forEach(path => {
            const lastKeywords = Object.values(resourceMap[path])
            const newKeywords = Object.values(currentCompileResourceMap[path])
            const deletedKeywords = lastKeywords.filter(item => !newKeywords.some(sub => sub === item))
             // 非初次编译，找出后面因为修改了文件删除了哪些词条，需要把对应配置表中的置空
            deletedKeywords.forEach(item => {
                reduceConfig(item)
            })
        })
    }
    // 统一更新本次编译收集到的映射信息
    for (const key in currentCompileResourceMap) {
        resourceMap[key] = currentCompileResourceMap[key]
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
 * 递减配置
 * @param {*} value 
 * @param {*} key 
 * @returns 
 */
const reduceConfig = (value, key) => {
    key = key || getKey(value)
    if (key && zhConfig[key]) {
        zhConfig[key].count--
        if (zhConfig[key].count === 0) {
            delete zhConfig[key]
        }
    }
}

/**
 * 递增配置
 * @param {*} value 
 * @param {*} key 
 */
const increaseConfig = (value, key) => {
    key = key || getKey(value)
    if (key && zhConfig[key]) {
        zhConfig[key].count++
    }
}
/**
 * 找出配置表中count为0的词条，代表在编译前就已经有词条删掉了，需要清空
 */
const clearEmptyConfig = () => {
    const copy = JSON.parse(JSON.stringify(zhConfig))
    for (const key in copy) {
        if (copy[key].count === 0) {
            delete zhConfig[key]
        }
    }
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

module.exports = {
    setConfig,
    editConfig,
    getConfig,
    setCurrentCompileResourceMap,
    updateResourceMap,
    getResource,
    output: {
        wholePath: outputPath,
        path,
        filename
    },
    addCompiledFiles,
    getCompiledFiles,
    setCompiledFiles,
    getKey,
    reduceConfig,
    setCompileDone,
    getCompileDone,
    increaseConfig,
    clearEmptyConfig,
}
