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
    globalSetting,
} = require('../common/collect')

module.exports = function i18nTransform (code) {
    const { resourcePath } = this
    const collection = []
    const keyInCodes = []
    let loadedDependency = false
    const {
        includes = [],
        excludes = [],
        name = '',
        alias = [],
        watch,
        dependency, // {name, value, objectPattern}
        transform = true,
        fallback = false,
    } = getOptions(this) || {}

    const hasCompiled = getCompileDone()
    const changeOnce = !watch && hasCompiled

    if (excludes.length && excludes.some(item => resourcePath.indexOf(item) === 0)) {
        return code
    }
    if (includes.length && includes.every(item => resourcePath.indexOf(item) !== 0)) {
        return code
    }
    let ast = baseParse.parse(code, {
        sourceType: 'unambiguous'
    })

    function isInConsole (path) {
        const { type: parentType, callee: parentCallee } = path.parent
        if (parentType === 'CallExpression' && parentCallee.type === 'MemberExpression') {
            const parentCalleeObject = parentCallee.object
            if (parentCalleeObject.type === 'Identifier' && parentCalleeObject.name === 'console') {
                return true
            }
        }
        return false
    }
    function findCommentExclude(path) {
        //If from TemplateLiteral to StringLiteral
        if (!path.node.loc) {
            return false
        } 
        const startLine = path.node.loc.start.line
        const leadingComments = path.node.leadingComments
        const check = (commentList) => {
            if (commentList && commentList.length) {
                const end = commentList.some(comment => {
                    return comment.type === 'CommentBlock' && comment.value.trim() === 'no-i18n-auto' && comment.loc.start.line === startLine
                })
                return end
            }
        }
        return (check(leadingComments) || check(ast.comments) || isInCreateCommentVNode(path))
    }

    
    function isInCreateCommentVNode(path) {
        return path.parent.type == 'CallExpression'
            && path.parent.callee.type == 'Identifier'
            && path.parent.callee.name == '_createCommentVNode'
    }

    const visitor = {
        // Finds if the user's dependency is in the import declaration
        ImportDeclaration (path) {
            if (!transform || !dependency || loadedDependency) {
                return
            }
            if (dependency.value !== path.node.source.value) {
                return
            }
            const matched = path.node.specifiers.some(item => {
                if (item.type === 'ImportDefaultSpecifier') {
                    return item.local.name === dependency.name
                } else if (item.type === 'ImportSpecifier') {
                    return item.imported.name === dependency.name
                }
            })
            matched && (loadedDependency = true)
        },
        VariableDeclarator (path) {
            if (!transform || !dependency || loadedDependency) {
                return
            }
            const initNode = path.node.init
            if (!initNode || initNode.type !== 'CallExpression') {
                return
            }
            let valueMatched = false
            let nameMatched = false
            const initNodeCallee = initNode.callee
            if (initNodeCallee.type === 'Identifier' && initNodeCallee.name === 'require') {
                const args = initNode.arguments
                if (args.length && dependency.value === args[0].value) {
                    valueMatched = true
                }
            }
            if (dependency.objectPattern) {
                if (path.node.id.type === 'ObjectPattern') {
                    path.node.id.properties.forEach(item => {
                        if (item.key.type === 'Identifier' && item.key.name === dependency.name) {
                            nameMatched = true
                        }
                    })
                }
            } else {
                if (path.node.id.type === 'Identifier' && path.node.id.name === dependency.name) {
                    nameMatched = true
                }
            }
            valueMatched && nameMatched && (loadedDependency = true)
        },
        CallExpression (path) {
            let wholeCallName = ''
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
            let i18nFnNames = [...alias]
            i18nFnNames.unshift(name)
            i18nFnNames.forEach(fnName => {
                let matched = false
                if (Object.prototype.toString.call(fnName) === '[object RegExp]') {
                    matched = fnName.test(wholeCallName)
                } else if (fnName === wholeCallName) {
                    matched = true
                }
                if (matched) {
                    if (path.node.arguments.length) {
                        const arg0 = path.node.arguments[0]
                        if (arg0.type === 'StringLiteral') {
                            keyInCodes.push(arg0.value)
                        }
                    }
                }
            })
        },
        StringLiteral (path) {
            if (['ExportAllDeclaration', 'ImportDeclaration', 'ExportNamedDeclaration'].indexOf(path.parent.type) !== -1) {
                return
            }
            if (findCommentExclude(path)) {
                return
            }

            if (isInConsole(path)) {
                return
            }
            if (path.node.type === 'StringLiteral') {
                const val = path.node.value
                if (globalSetting.localePattern.test(val)) {
                    const res = localeWordPattern(val)
                    if (res && res.length) {
                        if ((changeOnce || fallback) && res.some(word => !getKey(word))) {
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
            if (findCommentExclude(path)) {
                return
            }
            if (isInConsole(path)) {
                return
            }
            const hasWord = path.node.quasis.some(item => globalSetting.localePattern.test(item.value.raw))
            if (!hasWord) {
                return
            }
            let sections = path.node.expressions.map(node => {
                return {
                    start: node.start,
                    value: `(${generator.default(node).code})`
                }
            })
            path.node.quasis.forEach(node => {
                const string = node.value.raw
                if (string) {
                    const _string = string.replace(/"/g, '\\"')
                    const element = {
                        start: node.start,
                        value: '"' + _string + '"'
                    }
                    const unshiftIndex = sections.findIndex(item => node.start < item.start)
                    unshiftIndex === -1 ? sections.push(element) : sections.splice(unshiftIndex, 0, element)
                }
            })
            let code = sections.map(item => item.value).join('+')
            code.indexOf('\n') !== -1 && (code = code.replace(/\n/g, '\\n'))
            code.indexOf('\r') !== -1 && (code = code.replace(/\r/g, '\\r'))
            code.indexOf('\t') !== -1 && (code = code.replace(/\t/g, '\\t'))
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
    const newCode = generator.default(ast, {}, code).code

    setCurrentCompileResourceMap(resourcePath, collection, keyInCodes) // create the latest collection to this file in sourcemap variable

    addCompiledFiles(resourcePath)

    return newCode
}
