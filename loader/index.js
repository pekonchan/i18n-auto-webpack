const baseParse = require('@babel/parser')
const traverse = require('@babel/traverse')
const generator = require('@babel/generator')
const { getOptions } = require('loader-utils')
// const types = require('@babel/types')
// const fs = require('fs')
// const path = require('path')

const { transCode } = require('./transform.js')

const { setConfig, setResource, getCompiledFiles, addCompiledFiles, getKey } = require('../common/collect')

module.exports = function i18nTransform (code) {
    const { resourcePath } = this
    const collection = {}
    const { includes = [], excludes = [], name = '', watch } = getOptions(this) || {} // TODO: getOptions好像有版本要求，高版本好像没有这个方法了
    const changeOnce = !watch && getCompiledFiles().includes(resourcePath) // 已经编译过此文件了，是否只转译一次，后续更新的代码不再转移国际化，

    // 存在excludes选项，若当前文件属于排除对象，则不进行转译
    // 用indexOf而不直接用includes判断是因为excludes里有只到文件夹目录的路径，而非都是具体到文件
    if (excludes.length && excludes.some(item => resourcePath.indexOf(item) === 0)) {
        return code
    }
    // 存在includes选项，若当前文件不属于包含对象，则不进行转译
    if (includes.length && includes.some(item => resourcePath.indexOf(item) !== 0)) {
        return code
    }
    // TODO: 如何识别是否需要引入，已经引入的文件再次引入会有什么问题
    // const hasExist = code.indexOf('@global/lang') !== -1
    // if (!hasExist) {
    //     code = `
    //         const i18n = require('@global/lang').default
    //         ${code}
    //     `
    // }
    // let hasLangModule = false
    let ast = baseParse.parse(code, {
        sourceType: 'unambiguous'
    })
    const visitor = {
        // ObjectProperty (path) {
        //     if (path.node.type === 'ObjectProperty' && path.node.key.type === 'StringLiteral') {
        //         if (/[\u4e00-\u9fa5]/.test(path.node.key.value)) {
        //             path.node.key = types.callExpression(
        //                 types.identifier('$t'),
        //                 [
        //                     types.stringLiteral('message.hh')
        //                 ]
        //             )
        //             path.node.computed = true
        //         }
        //     }
        // },
        // ImportDeclaration (path) {
        //     if (path.node.source.value === '@global/lang') {
        //         hasLangModule = true
        //     }
        // },
        StringLiteral (path) {
            if (path.node.type === 'StringLiteral') {
                const val = path.node.value
                if (/[\u4e00-\u9fa5]/.test(val)) {
                    // 同一个启动程序中后续再次编译该文件，新增的词条不再转译国际化
                    if (changeOnce && !getKey(val)) {
                        return
                    }
                    const key = setConfig(val)
                    collection[key] = val
                    transCode({path, val, key, calle: name})
                }
            }
        }
    }
    traverse.default(ast, visitor)
    // 生成代码
    const newCode = generator.default(ast, {}, code).code

    Object.keys(collection).length && setResource(resourcePath, collection)

    addCompiledFiles(resourcePath) // 记录已经编译过一次该文件

    return newCode
}
