const fs = require('fs')
const path = require('path')

/**
 * 创建文件
 * @param {String} content - 文件内容
 * @param {String} path - 文件目录（不包含文件名）
 * @param {String} filename - 文件名（不包含目录）
 * @returns Promise
 */
const createFile = ({
    content, path: fileDir, filename
}) => {
    return new Promise((resolve, reject) => [
        fs.mkdir(fileDir, { recursive: true }, err => {
            if (err) {
                return reject(err)
            }
            fs.writeFile(path.resolve(fileDir, filename), content, err => {
                if (err) {
                    return reject(err)
                }
                return resolve()
            })
        })
    ])
}

module.exports = {
    createFile,
}