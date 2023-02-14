const baseParse = require('@babel/parser')
const traverse = require('@babel/traverse')
const generator = require('@babel/generator')
const { getOptions } = require('loader-utils')

const { transCode } = require('./transform.js')

const {
    setConfig,
    setCurrentCompileResourceMap,
    addCompiledFiles,
    getKey,
    getCompileDone,
} = require('../common/collect')

module.exports = function i18nTransform (code) {
    const { resourcePath } = this
    const collection = [] // 收集到本文件本次编译中需要转译国际化的词条
    let loadedDependency = false // 是否加入了指定依赖
    const {
        includes = [],
        excludes = [],
        name = '', // 替换代码中词条的实现国际化的函数名
        watch,
        dependency
    } = getOptions(this) || {} // TODO: getOptions好像有版本要求，高版本好像没有这个方法了
    
    const hasCompiled = getCompileDone()
    // feat: watch字段的功能：已经编译过此文件了，是否只转译一次，后续更新的代码不再转译国际化，
    const changeOnce = !watch && hasCompiled

    // 存在excludes选项，若当前文件属于排除对象，则不进行转译
    // 用indexOf而不直接用includes判断是因为excludes里有只到文件夹目录的路径，而非都是具体到文件
    if (excludes.length && excludes.some(item => resourcePath.indexOf(item) === 0)) {
        return code
    }
    // 存在includes选项，若当前文件不属于包含对象，则不进行转译
    if (includes.length && includes.some(item => resourcePath.indexOf(item) !== 0)) {
        return code
    }
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
        // Finds if the user's dependency is in the import declaration
        ImportDeclaration (path) {
            if (!dependency || loadedDependency) {
                return
            }
            if (dependency.value === path.node.source.value) {
                loadedDependency = true
            }
        },
        // Finds if the user's dependencies are in the require declaration
        CallExpression (path) {
            if (!dependency || loadedDependency || path.node.callee.name !== 'require') {
                return
            }
            const args = path.node.arguments
            if (args.length && dependency.value === args[0].value) {
                loadedDependency = true
            }
        },
        StringLiteral (path) {
            if (path.node.type === 'StringLiteral') {
                const val = path.node.value
                if (/[\u4e00-\u9fa5]/.test(val)) {
                    // feat watch: 同一个启动程序中后续再次编译该文件，新增的词条不再转译国际化
                    if (changeOnce && !getKey(val)) {
                        return
                    }
                    const key = setConfig(val)
                    collection.push({[key]: val})
                    transCode({path, val, key, calle: name})
                }
            }
        }
    }
    traverse.default(ast, visitor)

    // Whether to collect the language to be internationalized
    const hasLang = collection.length

    // If user set the dependency, which wants to import, but now hasn't imported, and has language to be internationalized
    if (dependency && hasLang && !loadedDependency) {
        // Add the import declaration
        const i18nImport =  `import ${dependency.name} from '${dependency.value}'`
        const i18nImportAst = baseParse.parse(i18nImport, {
            sourceType: 'module'
        })
        ast.program.body = [].concat(i18nImportAst.program.body, ast.program.body)
    }
    // 生成代码
    const newCode = generator.default(ast, {}, code).code

    setCurrentCompileResourceMap(resourcePath, collection) // create the latest collection to this file in sourcemap variable

    addCompiledFiles(resourcePath) // 记录已经编译过一次该文件

    return newCode
}
