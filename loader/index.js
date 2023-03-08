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
    const collection = []
    const keyInCodes = []
    let loadedDependency = false
    const {
        includes = [],
        excludes = [],
        name = '',
        watch,
        dependency, // {name, value, objectPattern}
        transform = true,
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
                const args = path.node.arguments
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
            if (wholeCallName === name) {
                const arg0 = path.node.arguments[0]
                if (arg0.type === 'StringLiteral') {
                    keyInCodes.push(arg0.value)
                }
            }
        },
        StringLiteral (path) {
            const { type: parentType, callee: parentCallee } = path.parent
            if (parentType === 'ImportDeclaration') {
                return
            }
            if (parentType === 'CallExpression' && parentCallee.type === 'MemberExpression') {
                const parentCalleeObject = parentCallee.object
                if (parentCalleeObject.type === 'Identifier' && parentCalleeObject.name === 'console') {
                    return
                }
            }
            if (path.node.type === 'StringLiteral') {
                const val = path.node.value
                if (/[\u4e00-\u9fa5]/.test(val)) {
                    const res = val.match(localeWordPattern)
                    if (res && res.length) {
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
            const hasWord = path.node.quasis.some(item => /[\u4e00-\u9fa5]/.test(item.value.raw))
            if (!hasWord) {
                return
            }
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
    const newCode = generator.default(ast, {}, code).code

    setCurrentCompileResourceMap(resourcePath, collection, keyInCodes) // create the latest collection to this file in sourcemap variable

    addCompiledFiles(resourcePath)

    return newCode
}
