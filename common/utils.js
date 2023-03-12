const fs = require('fs')
const path = require('path')

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