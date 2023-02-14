const types = require('@babel/types')

// 一个字符串中，把按照换行符分割的带有中文部分的头尾无空格的子串找出来。查看示例：'yyyy 第 WW 周\n sz \n  端格式  '.match(/(\S.*)*[\u4e00-\u9fa5]+(.*\S)*/g)
const localeWordPattern = /(\S.*)*[\u4e00-\u9fa5]+(.*\S)*/g
// const localeWordPattern = /\S*[\u4e00-\u9fa5]+\S*/g

const createT = ({originValue, wordKeyMap, calle}) => {
    let matchResults = localeWordPattern.exec(originValue)
    let splits = []
    let lastIndex = 0
    let stringLeft = ''
    // 循环找出这个字符串中满足要求的子串，各自生成翻译函数，并和普通子串组成新的节点
    while (matchResults) {
        // 命中的字符串前部分生成stringLiteral节点push到splits中
        if (lastIndex !== matchResults.index) {
            const node = types.stringLiteral(originValue.substring(lastIndex, matchResults.index))
            splits.push(node)
        }
        // 将命中匹配的子串生成翻译函数节点push到splits中
        const matchedWord = originValue.substring(matchResults.index, localeWordPattern.lastIndex)
        const callNode = types.callExpression(
            types.identifier(calle),
            [
                types.stringLiteral('' + wordKeyMap[matchedWord]) // 得传字符串，不然会报错
            ]
        )
        splits.push(callNode)
        // 存储命中匹配的子串后面的子串，后续用作判断
        stringLeft = originValue.substring(localeWordPattern.lastIndex)
        lastIndex = localeWordPattern.lastIndex
        matchResults = localeWordPattern.exec(originValue)
    }
    // 有值代表剩余的这个子串匹配不出来，就单独生成stringLiteral节点
    if (stringLeft) {
        const node = types.stringLiteral(stringLeft)
        splits.push(node)
    }
    // 正常情况下是不会长度为0的，因为进入该方法前，已经判断过这里面肯定有中文的了，所以不会找不到
    // 这里是为了代码严谨性，才写的判断
    if (!splits.length) {
        return
    }
    // 只有一个元素代表整个字符串符合匹配要求
    if (splits.length === 1) {
        return splits[0]
    } else {
        // 将拆分的各个节点组合起来，组成binaryExpression替换原来字符串的stringLiteral节点
        const recurExp = (nodeList) => {
            if (nodeList.length > 2) {
                const lastIndex = nodeList.length -1
                const right = nodeList[lastIndex]
                const left = recurExp(nodeList.slice(0, lastIndex))
                return types.binaryExpression('+', left, right)
            } else {
                return types.binaryExpression('+', nodeList[0], nodeList[1])
            }
        }
        const result = recurExp(splits)
        return result
    }
}

/**
 * 转换方法参数的字符串
 * html标签中的文本替换，实际上会先转成_vm._v('xx')，现在要变成_vm._v(_vm.$t('n')) , n为翻译的代号
 * @param {*} path
 * @param {*} originValue
 * @param {*} key
 */
function transMethodArg({path, originValue}) {
    const argI = path.parent.arguments.findIndex(item => item.type === 'StringLiteral' && item.value === originValue)
    path.parent.arguments[argI] = createT(arguments[0])
}

function transArrayEle({path, originValue}) {
    const eleI = path.parent.elements.findIndex(item => item.type === 'StringLiteral' && item.value === originValue)
    path.parent.elements[eleI] = createT(arguments[0])
}

function transVarDec({path}) {
    path.parent.init = createT(arguments[0])
}

function transBinaryExp({path, originValue}) {
    const left = path.parent.left
    if (left.type === 'StringLiteral' && left.value === originValue) {
        path.parent.left = createT(arguments[0])
    } else {
        path.parent.right = createT(arguments[0])
    }
}

/**
 * 属性值 如 a: b，这里指转换b
 * @param {*} param0
 * @param {*} calle
 */
function transObjectValue({path}) {
    path.parent.value = createT(arguments[0])
}

/**
 * 条件表达式 如 a ? b : c
 * @param {*} param0
 * @param {*} calle
 */
function transCondExp({path, originValue}) {
    const { consequent, alternate, test } = path.parent
    if (test.type === 'StringLiteral' && test.value === originValue) {
        path.parent.test = createT(arguments[0])
    } else if (consequent.type === 'StringLiteral' && consequent.value === originValue) {
        path.parent.consequent = createT(arguments[0])
    } else if (alternate.type === 'StringLiteral' && alternate.value === originValue) {
        path.parent.alternate = createT(arguments[0])
    }
}

/**
 * 逻辑表达式 如 a || b
 * @param {*} param0
 * @param {*} calle
 */
function transLogicExp({path, originValue}) {
    const { left, right } = path.parent
    if (left.type === 'StringLiteral' && left.value === originValue) {
        path.parent.left = createT(arguments[0])
    } else if (right.type === 'StringLiteral' && right.value === originValue) {
        path.parent.right = createT(arguments[0])
    }
}

/**
 * 返回声明，return xx
 * @param {*} param0
 * @param {*} calle
 */
function transReturnState({path}) {
    path.parent.argument = createT(arguments[0])
}

/**
 * 赋值声明 a = xxx
 * @param {*} param0
 * @param {*} calle
 */
function transAssign({path, originValue}) {
    const { right } = path.parent
    if (right.type === 'StringLiteral' && right.value === originValue) {
        path.parent.right = createT(arguments[0])
    }
}

function transCode ({path, originValue, wordKeyMap, calle}) {
    switch (path.parent.type) {
        case 'CallExpression': transMethodArg(arguments[0]); break
        case 'ArrayExpression': transArrayEle(arguments[0]); break
        case 'VariableDeclarator': transVarDec(arguments[0]); break
        case 'BinaryExpression': transBinaryExp(arguments[0]); break
        case 'ObjectProperty': transObjectValue(arguments[0]); break
        case 'ConditionalExpression': transCondExp(arguments[0]); break
        case 'LogicalExpression': transLogicExp(arguments[0]); break
        case 'ReturnStatement': transReturnState(arguments[0]); break
        case 'AssignmentExpression':
        case 'AssignmentPattern': transAssign(arguments[0]); break
    }
}

module.exports = {
    transCode,
    localeWordPattern
}
