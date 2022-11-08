const rootPath = process.cwd()
const { resolve } = require('path')
const config = require(rootPath + '/i18nauto.config.js')
const {
    entry,
    output: {
        filename = 'zh',
        path = resolve(rootPath, './lang')
    } = {}
} = config || {}
const outputPath = resolve(path, `./${filename}.json`)

let zhConfig = {}
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
} catch (e) {}

const resourceMap = {}

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

    let currentKey = ''
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
    }
}
