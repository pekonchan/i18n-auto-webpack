const {
    globalSetting
} = require('../common/collect')
const {
    secretId,
    secretKey,
    region,
    endpoint,
    source,
    projectId,
} = globalSetting.translate || {}

const tencentcloud = require("tencentcloud-sdk-nodejs-tmt")
const TmtClient = tencentcloud.tmt.v20180321.Client

const clientConfig = {
    // credential: {
    //     secretId: "AKID7A7wc7PWRA4mJfrpaAnFWbUEm9KsNrJs",
    //     secretKey: "cL8ugQ84w2MMJ7nQwGNSPNGhy3299wYz",
    // }
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
const client = new TmtClient(clientConfig)

/**
 * 翻译接口
 * @param {*} param0 
 */
const translateTo = ({
    target,
    sourceTextList
}) => {
    const params = {
        Source: source,
        Target: target,
        ProjectId: projectId,
        SourceTextList: sourceTextList
    }
    client.TextTranslateBatch(params).then(
        (data) => {
            return data.TargetTextList
        },
        (err) => {
            console.error("i18n-auto-webpack : translate error", err);
        }
    )
}

module.exports = {
    translateTo
}