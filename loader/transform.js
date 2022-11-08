const types = require('@babel/types')

const createT = (key, calle) => {
    return types.callExpression(
        types.identifier(calle),
        [
            types.stringLiteral('' + key) // 得传字符串，不然会报错
        ]
    )
}

/**
 * 转换方法参数的字符串
 * html标签中的文本替换，实际上会先转成_vm._v('xx')，现在要变成_vm._v(_vm.$t('n')) , n为翻译的代号
 * @param {*} path
 * @param {*} val
 * @param {*} key
 */
const transMethodArg = ({path, val, key, calle}) => {
    const argI = path.parent.arguments.findIndex(item => item.type === 'StringLiteral' && item.value === val)
    path.parent.arguments[argI] = createT(key, calle)
}

const transArrayEle = ({path, val, key, calle}) => {
    const eleI = path.parent.elements.findIndex(item => item.type === 'StringLiteral' && item.value === val)
    path.parent.elements[eleI] = createT(key, calle)
}

const transVarDec = ({path, val, key, calle}) => {
    path.parent.init = createT(key, calle)
}

const transBinaryExp = ({path, val, key, calle}) => {
    const left = path.parent.left
    if (left.type === 'StringLiteral' && left.value === val) {
        path.parent.left = createT(key, calle)
    } else {
        path.parent.right = createT(key, calle)
    }
}

/**
 * 属性值 如 a: b，这里指转换b
 * @param {*} param0
 * @param {*} calle
 */
const transObjectValue = ({path, val, key, calle}) => {
    path.parent.value = createT(key, calle)
}

/**
 * 条件表达式 如 a ? b : c
 * @param {*} param0
 * @param {*} calle
 */
const transCondExp = ({path, val, key, calle}) => {
    const { consequent, alternate } = path.parent
    if (consequent.type === 'StringLiteral' && consequent.value === val) {
        path.parent.consequent = createT(key, calle)
    } else if (alternate.type === 'StringLiteral' && alternate.value === val) {
        path.parent.alternate = createT(key, calle)
    }
}

/**
 * 逻辑表达式 如 a || b
 * @param {*} param0
 * @param {*} calle
 */
const transLogicExp = ({path, val, key, calle}) => {
    const { left, right } = path.parent
    if (left.type === 'StringLiteral' && left.value === val) {
        path.parent.left = createT(key, calle)
    } else if (right.type === 'StringLiteral' && right.value === val) {
        path.parent.right = createT(key, calle)
    }
}

/**
 * 返回声明，return xx
 * @param {*} param0
 * @param {*} calle
 */
const transReturnState = ({path, val, key, calle}) => {
    path.parent.argument = createT(key, calle)
}

/**
 * 赋值声明 a = xxx
 * @param {*} param0
 * @param {*} calle
 */
const transAssign = ({path, val, key, calle}) => {
    const { right } = path.parent
    if (right.type === 'StringLiteral' && right.value === val) {
        path.parent.right = createT(key, calle)
    }
}

function transCode ({path, val, key, calle}) {
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
    transCode
}
