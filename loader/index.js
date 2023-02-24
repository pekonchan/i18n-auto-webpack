const baseParse = require('@babel/parser')
const traverse = require('@babel/traverse')
const generator = require('@babel/generator')
const { getOptions } = require('loader-utils')

const {
    transCode,
    localeWordPattern,
} = require('./transform.js')

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
    const keyInCodes = [] // 收集代码中直接写国际化方法使用到的key
    let loadedDependency = false // 是否加入了指定依赖
    const {
        includes = [],
        excludes = [],
        name = '', // 替换代码中词条的实现国际化的函数名
        watch,
        dependency, // {name, value, objectPattern}格式
        transform = true, // 是否需要转换代码
    } = getOptions(this) || {}
    
    const hasCompiled = getCompileDone()
    // feat: watch字段的功能：已经编译过此文件了，是否只转译一次，后续更新的代码不再转译国际化，
    const changeOnce = !watch && hasCompiled

    // 存在excludes选项，若当前文件属于排除对象，则不进行转译
    // 用indexOf而不直接用includes判断是因为excludes里有只到文件夹目录的路径，而非都是具体到文件
    if (excludes.length && excludes.some(item => resourcePath.indexOf(item) === 0)) {
        return code
    }
    // 存在includes选项，若当前文件不属于包含对象，则不进行转译
    if (includes.length && includes.every(item => resourcePath.indexOf(item) !== 0)) {
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
            // 若不需要转换代码 或 没依赖项 或 已经引入依赖，就不用处理
            if (!transform || !dependency || loadedDependency) {
                return
            }
            // 若依赖的路径不符，也不用进行下一步判断
            if (dependency.value !== path.node.source.value) {
                return
            }
            // 存在两种形式的判断
            const matched = path.node.specifiers.some(item => {
                // 一种是import xx from 'yy' 的形式，现在要检查xx是否跟传入的依赖的名字相同
                if (item.type === 'ImportDefaultSpecifier') {
                    return item.local.name === dependency.name
                // 一种是import {xx} from 'yy' 的形式，现在要检查xx是否跟传入的依赖的名字相同
                } else if (item.type === 'ImportSpecifier') {
                    return item.imported.name === dependency.name
                }
            })
            // 匹配上，代表已经引入了所需的依赖了
            matched && (loadedDependency = true)
        },
        // 目标是 cosnt xx = require('xxx') ，cosnt {xx} = require('xxx') 以这个目标来检查
        VariableDeclarator (path) {
            // 若不需要转换代码 或 没依赖项 或 已经引入依赖，就不用处理
            if (!transform || !dependency || loadedDependency) {
                return
            }
            const initNode = path.node.init
            if (!initNode || initNode.type !== 'CallExpression') {
                return
            }
            let valueMatched = false // 引入路径是否匹配上
            let nameMatched = false // 引入变量是否匹配上
            // // START: 检查require部分
            const initNodeCallee = initNode.callee
            if (initNodeCallee.type === 'Identifier' && initNodeCallee.name === 'require') {
                const args = path.node.arguments
                // 检查路径是否满足
                if (args.length && dependency.value === args[0].value) {
                    valueMatched = true
                }
            }
            // START: 检查等号前部分
            // 若是解构形式
            if (dependency.objectPattern) {
                if (path.node.id.type === 'ObjectPattern') {
                    path.node.id.properties.forEach(item => {
                        if (item.key.type === 'Identifier' && item.key.name === dependency.name) {
                            nameMatched = true
                        }
                    })
                }
            // 若是普通变量形式
            } else {
                if (path.node.id.type === 'Identifier' && path.node.id.name === dependency.name) {
                    nameMatched = true
                }
            }
            valueMatched && nameMatched && (loadedDependency = true)
        },
        CallExpression (path) {
            // Start: 找出是否有用国际化函数直接写编码使用配置文件的代码
            // 有的话就不能删除掉词条配置表文件中的相关词条，例如$t('10')，则在词条配置表中key为10的词条要保留，不能删除
            let wholeCallName = '' // 调用方法的整体名字写法，例如 a.b.c('10')，则结果应该为'a.b.c'，因为dependcy客户就是可能直接传的链式调用字符串
            // 递归找出整体的方法调用写法
            const recurName = (node) => {
                if (node.type === 'MemberExpression') {
                    recurName(node.object)
                    if (node.property.type === 'Identifier') {
                        wholeCallName += ('.' + node.property.name)
                    }
                } else if (node.type === 'Identifier') {
                    wholeCallName += ('.' + node.name)
                }
            }
            recurName(path.node.callee)
            wholeCallName = wholeCallName.substring(1)
            // 如果调用方法名写法与denpency传的一样
            if (wholeCallName === name) {
                // 把调用参数的key存起来
                const arg0 = path.node.arguments[0]
                if (arg0.type === 'StringLiteral') {
                    keyInCodes.push(arg0.value)
                }
            }
            // End
            
        },
        StringLiteral (path) {
            // 这个字符串节点是在import里就不用处理了
            // TODO: 实际上还应判断require里的路径也不用处理，但是略过麻烦。事实上建议文件或文件夹不要包含中文才对
            if (path.parent.type === 'ImportDeclaration') {
                return
            }
            if (path.node.type === 'StringLiteral') {
                const val = path.node.value
                // 判断是否有中文才执行里面的逻辑，试过不加这个判断，但是运行下面脚本会卡住，不知道出现什么问题，也没报错啥的，能肯定的是正则匹配那块出了问题
                if (/[\u4e00-\u9fa5]/.test(val)) {
                    const res = val.match(localeWordPattern)
                    if (res && res.length) {
                        // feat watch: 同一个启动程序中后续再次编译该文件，新增的词条不再转译国际化
                        if (changeOnce && res.some(word => !getKey(word))) {
                            return
                        }
                        const wordKeyMap = {}
                        res.forEach(word => {
                            const key = setConfig(word)
                            collection.push({[key]: word})
                            wordKeyMap[word] = key
                        })
                        transform && transCode({path, originValue: val, wordKeyMap, calle: name})
                    }
                }
            }
        },
        TemplateLiteral (path) {
            // 先判断里面有没有中文，没有则不做任何处理
            const hasWord = path.node.quasis.some(item => /[\u4e00-\u9fa5]/.test(item.value.raw))
            if (!hasWord) {
                return
            }
            // 将模板字符串改成普通的字符串连接写法，组成源代码写法
            let sections = path.node.expressions.map(node => {
                return {
                    start: node.start,
                    value: generator.default(node).code
                }
            })
            path.node.quasis.forEach(node => {
                const string = node.value.raw
                if (string) {
                    const element = {
                        start: node.start,
                        value: '"' + string + '"'
                    }
                    const unshiftIndex = sections.findIndex(item => node.start < item.start)
                    unshiftIndex === -1 ? sections.push(element) : sections.splice(unshiftIndex, 0, element)
                }
            })
            const code = sections.map(item => item.value).join('+')
            path.replaceWithSourceString(code)
        }
    }
    traverse.default(ast, visitor)

    // Whether to collect the language to be internationalized
    const hasLang = collection.length

    // If user set the dependency, which wants to import, but now hasn't imported, and has language to be internationalized
    if (transform && dependency && hasLang && !loadedDependency) {
        // Add the import declaration
        const { name, objectPattern } = dependency
        const i18nImport =  `import ${objectPattern ? ('{' + name + '}') : name} from '${dependency.value}'`
        const i18nImportAst = baseParse.parse(i18nImport, {
            sourceType: 'module'
        })
        ast.program.body = [].concat(i18nImportAst.program.body, ast.program.body)
    }
    // 生成代码
    const newCode = generator.default(ast, {}, code).code

    setCurrentCompileResourceMap(resourcePath, collection, keyInCodes) // create the latest collection to this file in sourcemap variable

    addCompiledFiles(resourcePath) // 记录已经编译过一次该文件

    return newCode
}
