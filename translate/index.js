const fs = require('fs')
const {
    globalSetting
} = require('../common/collect')
const {
    translate: globalSettingTranslate
} = globalSetting
const {
    secretId,
    secretKey,
    region,
    endpoint,
    source,
    projectId,
} = globalSettingTranslate || {}
const { createFile } = require('../common/utils')

const tencentcloud = require("tencentcloud-sdk-nodejs-tmt")
const TmtClient = tencentcloud.tmt.v20180321.Client

const clientConfig = {
    credential: {
        secretId,
        secretKey,
    },
    region,
    profile: {
        httpProfile: {
            endpoint
        }
    }
}

/**
 * 翻译接口
 * @param {*} param0 
 */
const translateTo = ({
    target,
    textConfig
}) => {
    const translateLenLimit = 2000 // 一次翻译请求最大字符串数
    const secondRequestLimit = 5 // 每秒请求的最大次数
    let sum = 0
    let splitConfig = {} // 作为临时性变量，存放一组词条
    let splitList = [] // 分拆要翻译的词条，分成多组，每组词条累加起来不超过最大限制字符串数，一组为发一次请求
    let secondList = [] // 分组发送请求，每组请求间隔1秒，一组有secondRequestLimit个请求
    // 将要进行翻译的词条配置进行分拆
    // 每个词条累加起来不超过翻译api接口限制的最大字符数作为一组
    for (const key in textConfig) {
        const value = textConfig[key]
        sum += value.length
        // 单条就已经超出了腾讯翻译要求的翻译文本长度限制了。没办法，只能要求使用者自己切断下
        if (value.length > translateLenLimit) {
            throw 'i18n-auto-webpack : translate error —— The translate request UnsupportedOperation.TextTooLong'
        }
        // 算上当前这条词条的话，累加起来已经超过最大限制了
        if (sum > translateLenLimit) {
            // 超过了就不算上当前词条，把之前累加起来没问题的词条作为一组放到splitList里
            splitList.push(splitConfig)
            splitConfig = {}
            sum = value.length
            splitConfig[key] = value
        } else {
            splitConfig[key] = value
        }
    }
    // 遍历完了，还有剩下的没有超过限制归为一组
    splitList.push(splitConfig)
    // 根据拆分的每组词条配置情况，看分为几组延迟统一发出请求
    const groupNum = Math.ceil(splitList.length / secondRequestLimit)
    for (let i = 0; i < groupNum; i++) {
        const start = i * secondRequestLimit
        secondList.push(splitList.slice(start, start + 5))
    }
    // 递归执行按组间隔发送请求进行翻译
    return timeOutSend(target, secondList, 0)
}

/**
 * 按组间隔发送请求进行翻译，递归执行
 * @param {String} target - 要翻译成哪种语言
 * @param {Array} secondList - 请求的分组情况列表
 * @param {Promise} i - 第几组
 * @returns 
 */
const timeOutSend = (target, secondList, i) => {
    return new Promise((resolve, reject) => {
        const list = secondList[i]
        const promises = []
        list.forEach(item => {
            const promise = send(target, item)
            promises.push(promise)
        })
        // 当前这组请求都执行完毕后才发起下一组（翻译接口的限制）
        Promise.all(promises).then(res => {
            const result = res.reduce((config, result) => {
                return Object.assign(result, config)
            }, {})
            const nextI = i + 1
            // 如果没有下一组了，则结束递归
            if (nextI < secondList.length) {
                // 翻译接口要求间隔1秒，但是这里为了稳妥起见，我加多了100ms
                setTimeout(async () => {
                    // 递归
                    const res = await timeOutSend(target, secondList, nextI)
                    Object.assign(result, res)
                    return resolve(result)
                }, nextI * 1100)
            } else {
                return resolve(result)
            }
        }).catch(err => {
            reject(err)
        })
    })
}


/**
 * 发送请求进行翻译
 * @param {String} target - 要翻译成哪种语言
 * @param {Object} textConfig - 要翻译的词条配置 {key, value}格式
 * @returns 
 */
const send = (target, textConfig) => {
    return new Promise((resolve, reject) => {
        let result = {}
        const keys = Object.keys(textConfig)
        const values = Object.values(textConfig)
        const params = {
            Source: source,
            Target: target,
            ProjectId: projectId,
            SourceTextList: values
        }
        const client = new TmtClient(clientConfig)
        client.TextTranslateBatch(params).then(
            (data) => {
                // 翻译接口是根据请求的参数顺序按同样顺序返回在响应数据中
                // 而Object.keys 和 Object.values方法都是按相同顺序生成数组的。所以key和value是一一对应的
                keys.forEach((key, index) => {
                    result[key] = data.TargetTextList[index]
                })
                return resolve(result)
            },
            err => {
                console.error("i18n-auto-webpack : translate error", err)
                return reject(err)
            }
        )
    })
}

/**
 * 生成翻译文件
 * @param {Object} target - 翻译的目标配置
 * @param {Object} source - 翻译的来源配置
 * @param {Boolean} needFile - 是否把翻译的结果生成文件
 * @returns Promise 返回的回调结果是一个对象，以翻译的语言为key，翻译结果为value
 */
const createTranslate = (target, source, needFile = true) => {
    return new Promise((resolve, reject) => {
        const {
            path = globalSettingTranslate.path, // 翻译文件的目录
            lang = globalSettingTranslate.lang, // 翻译语言
            nameRule = globalSettingTranslate.nameRule // 翻译文件的名称，不同语言各自有各自名称
        } = target
        const {
            path: sourcePath, // 用作翻译的来源的文件完整绝对路径（带文件名的）
            text, // 用作翻译的来源内容
        } = source
        const localeConfig = text || require(sourcePath)
        const result = {} // (多个)翻译结果
        // 用于递归的翻译函数
        const translateLang = (index) => {
            const item = lang[index]
            const fileName = nameRule(item)
            const filePath = path + '/' + fileName
            let deletedKeys = []
            fs.access(filePath, fs.constants.F_OK, async (err) => {
                let translateWordConfig = {} // 等待翻译的词条
                let langConfig = {}
                // 若不存在，则直接根据收集的词条生成翻译词条文件
                if (err) {
                    for (const key in localeConfig) {
                        translateWordConfig[key] = localeConfig[key]
                    }
                // 若存在，只翻译新增的词条 以及 删除掉不存在的词条
                } else {
                    langConfig = require(filePath)
                    deletedKeys = Object.keys(langConfig).filter(key => !Object.keys(localeConfig).some(localeKey => localeKey === key))
                    deletedKeys.forEach(key => {
                        delete langConfig[key]
                    })
                    for (const key in localeConfig) {
                        if (!langConfig[key]) {
                            translateWordConfig[key] = localeConfig[key]
                        }
                    }
                }
                const translationFileParam = {
                    content: JSON.stringify(langConfig),
                    path,
                    filename: fileName
                }
                // 有需要翻译的
                if (Object.keys(translateWordConfig).length) {
                    try {
                        const translateRes = await translateTo({
                            target: item,
                            textConfig: translateWordConfig
                        })
                        Object.assign(langConfig, translateRes)
                        
                        translationFileParam.content = JSON.stringify(langConfig)
                        needFile && createFile(translationFileParam)
                        result[item] = langConfig
                    } catch (e) {
                        return reject(e)
                    }
                } else if (deletedKeys.length) {
                    needFile && createFile(translationFileParam)
                }
                // 递归执行翻译剩余语言，主要目的是为了确保翻译接口1秒内5个请求的限制
                index++
                if (index < lang.length) {
                    setTimeout(() => {
                        translateLang(index)
                    }, 1100)
                } else {
                    return resolve(result)
                }
            })
        }
        // 递归执行
        translateLang(0)
    })
}


module.exports = {
    createTranslate,
}