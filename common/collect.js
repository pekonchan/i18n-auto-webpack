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
            count: 1 // 从已存在的配置文件中获取的话，除非是有生成map文件，不然都是为0。  TODO：map文件的逻辑还没实现
        }
    }
} catch (e) {
    console.error(e)
}

const resourceMap = {} // 记录文件各词条情况映射表

const compiledFiles = [] // 编译过的文件路径集合

/**
 * 设置词条
 * @param {String} value 词条
 * @param {String} key 编号
 * @returns {String} 编号
 */
const setConfig = (value, key) => {
    // 指定key时，若存在，则直接赋予指定value，重置计数; 若不存在，则按照指定key添加新词条
    if (key) {
        zhConfig[key] = {
            value,
            count: 1
        }
        return key
    }

    let currentKey = getKey(value) // 找出当前设置的词条是否已经存在
    // 已存在，计数+1
    if (currentKey) {
        zhConfig[currentKey].count++
        return currentKey
    // 不存在，插入一条新词条
    } else {
        const len = Object.keys(zhConfig).length
        return addConfig(len, value)
    }
}

const addConfig = (key, value) => {
    if (zhConfig[key]) {
        addConfig[++key]
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

const setResource = (path, config) => {
    resourceMap[path] = config
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
 * @returns Array 返回编译过文件的记录
 */
const getCompiledFiles = () => {
    return compiledFiles.concat()
}

module.exports = {
    setConfig,
    editConfig,
    getConfig,
    setResource,
    getResource,
    output: {
        wholePath: outputPath,
        path,
        filename
    },
    addCompiledFiles,
    getCompiledFiles,
    getKey
}
