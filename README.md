# i18n-auto-webpack

使用该工具包可以帮助你以自动化形式完成国际化工作，能够自动地收集中文词条、替换代码为指定的国际化转换函数、自动翻译等功能

> 注意该工具在编译过程转换代码的，而不是永久性地替换代码，不具备破坏性

这个工具包主要分为两个主要部分
- loader。这是一个自定义的`webpack`loader，需要指定引入该loader以完成自动收集与替换代码主要功能。
- plugin。这是一个自定义`webpack`plugin，需要使用该插件以完成生成词条配置文件的功能。

使用的方法也就是`webpack`对loader和plugin的使用方法。

> 需要注意，该工具不包含实现国际化转换函数。每个项目采用的语言框架不一样，各自采用的转换函数调用方式也都不一样，该工具是要搭配国际化转换函数一起使用的。如你项目是`vue`，可使用`vue-i18n`，`React`的`react-intl`和`react-i18next`，`angular`的`ngx-translate`，或者自己实现转换函数等等。`i18n-auto-webpack`只提供收录词条、替换代码为指定的国际化转化函数、以及翻译词条能力（除非你就是想单独使用这些能力）。

> 这里说的转换函数，如vue-i18n的`$t`之类的方法

## Usage

### 安装
```
npm i i18n-auto-webpack
```

在工程项目根目录下创建全局配置文件`i18nauto.config.js`
```js
const {resolve} = require('path')
const rootPath = process.cwd()

module.exports = {
    // 中文词条的配置文件
    entry: {
        filename: 'zh.json', // 文件名（不含目录路径）
        path: resolve(rootPath, './lang') // 文件所在绝对目录（不含文件名）
    },
    // 翻译配置
    translate: {
        on: true, // 是否开启翻译
        lang: ['en'], // 要翻译成哪些语言
        path: resolve(rootPath, './lang'), // 生成的翻译文件所在目录
        secretId: 'your secretId', // 必填。翻译api所需的你用户信息secretId 
        secretKey: 'your secretKey' // 必填。翻译api所需的你用户信息secretKey
    }
}
```
`entry`是指定根据已有的中文词条配置表基础上更新收集的词条，没有的话直接创建。

例如你项目里已经存在一份中文词条配置文件，抑或是你之前就已经利用该工具生成过一份配置文件了，接下来的开发是需要基于这份已有的文件进行更新新增或被删除的词条。

默认情况下，收集完成后同样会更新到`entry`指定路径的文件中。即这个文件既被用来作为收集词条的基础，又被作为最终生成的配置文件。若指定路径文件不存在，会自动创建该文件。

> 特殊情况下，假设你有需要生成配置文件到不同于`entry`的地方，那么可以指定`output`字段，该字段默认值就是`entry`，你也可以自己指定。但是值得注意的是，当你指定了一个不同于`entry`的值，若`entry`和`output`的文件不能保持一样，就会每次收集词条就会把`output`里比`entry`多的词条视为新增的词条，就会触发重新生成配置文件，所以当你毅然选择指定`output`，请保持手动同步更新到`entry`文件中（当然你有另外用途需要区分开来除外）。 因此我的建议是，没啥特殊情况，就只使用一个`entry`字段就好了

`i18nauto.config.js`更多配置规则请查阅[`i18nauto.config.js`配置表](https://github.com/pekonchan/i18n-auto-webpack#i18nautoconfigjs)

`translate`翻译设置部份，需要有更多的说明，请查阅[配置翻译](https://github.com/pekonchan/i18n-auto-webpack#%E9%85%8D%E7%BD%AE%E7%BF%BB%E8%AF%91)

### 配置loader
在webpack的配置中进行如下设置
```js
exports.export = {
    module: {
        rules: [
            {
                test: /\.js$/,
                loader: 'i18n-auto-webpack/loader',
                options: {
                    watch: true,
                    name: 'i18n.t',
                    dependency: {
                        name: 'i18n',
                        value: 'src/common/i18n.js'
                    }
                }
            }
        ]
    }
}
```
对什么文件内的中文要进行收录，就对这些文件使用工具的`loader`，引用的`loader`路径为`i18n-auto-webpack/loader`。

例子中`options`选项的为基础常用的配置：

#### watch
是否监听更新，若设置`true`，则开发者编写代码每触发一次热更新，就收集一次代码中新增的中文词条替换代码。若设置为`false`，则只对第一次启动工程构建的文件进行收集词条替换代码，后续开发中新增的不会对新增的词条进行代码替换。默认为`false`。 可多个`loader`使用不同的`watch`。

#### name
国际化语言切换函数的调用路径。例如你原本想要替换代码中的中文词条为国际化语言切换函数，怎么调用这个函数就传什么，例如`i18n.t('001')`，虽然最终执行的是`t`函数，但是你调用这个`t`需要通过`i18n`这个对象，那么完整的调用路径即为`i18n.t`，所以name要传`i18n.t`。

#### dependency
国际化语言切换函数所需的依赖。例如`i18n`这个对象的内容是封装在这个`src/common/i18n.js`文件中导出的，要进行切换，需要用到`i18n`这个对象里的`t`函数。那么`dependency`就有两种写法:
```js
// 写法一
options: {
    name: 'i18n.t',
    dependency: {
        name: 'i18n',
        value: 'src/common/i18n.js'
    }
}

// 上述写法会最终生成代码 import i18n from 'src/common/i18n.js'
// 然后代码中将会使用i18n.t()进行切换语言

// 写法二
options: {
    name: 't'
    dependency: {
        name: 't',
        objectPattern: true, // 表示解构形式
        value: 'src/common/i18n.js'
    }
}

// 上述写法会最终生成代码 import { t } from 'src/common/i18n.js'
// 然后代码中将会使用t()进行切换语言
```

loader更多配置请查阅 [loader配置表](https://github.com/pekonchan/i18n-auto-webpack#loader)

#### 注意事项
`i18n-auto-webpack/loader`预期接收的代码是`Javascript`内容，它的工作原理是对传递进来的是`Javascript`代码解析成`AST`，然后分析`AST`查找提取中文等系列操作后再转回去`Javascript`代码。

所以当你若要对一个非`Javascript`内容的文件使用`i18n-auto-webpack/loader`时，请在其他`loader`将其转化为`Javascript`后使用，请确保`loader`的执行顺序。

例如`.vue`文件，你想收录`.vue`文件里`template`和`script`部份的中文词条，则要对`.vue`文件使用`i18n-auto-webpack/loader`。

```js
// webpack config file

const i18nAutoLoaderOptions = {
    watch: true,
    name: 'i18n.t',
    dependency: {
        name: 'i18n',
        value: 'src/common/i18n.js'
    }
}

// 针对vue-loader v14版本
module.exports = {
    module: {
        rules: [
            // 在原本使用vue-loader的那个规则上新增它的options配置，加上对'i18n-auto-webpack/loader'的处理
            {
                test: /\.vue$/,
                use: [
                    {
                        loader: 'vue-loader',
                        options: {
                            postLoaders: {
                                // 这里是在template部份转化成render函数（js代码）后用'i18n-auto-webpack/loader'处理
                                html: {
                                    loader: 'i18n-auto-webpack/loader',
                                    options: {
                                        watch: true,
                                        name: '_vm'
                                    }
                                },
                                js: {
                                    loader: 'i18n-auto-webpack/loader',
                                    options: i18nAutoLoaderOptions
                                }
                            }
                        }
                    }
                ]
            }
        ]
    }
}

// 针对vue-loader v15版本
module.exports = {
    module: {
        rules: [
            // 这是原本对vue文件使用vue-loader的规则
            {
                test: /\.vue$/,
                loader: 'vue-loader'
            },
            // 针对vue文件里的template部分。这个要新起一个规则，不能用在原来使用`vue-loader`的那个规则里
            {
                test: /\.vue$/,
                resourceQuery: /type=template/,
                enforce: 'post',
                loader: 'i18n-auto-webpack/loader',
                options: i18nAutoLoaderOptions
            },
            // 原来对js文件使用的规则，同样会适用于vue文件里的script部份的js代码。
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'i18n-auto-webpack/loader',
                        options: i18nAutoLoaderOptions
                    },
                    {
                        loader: 'babel-loader'
                    }
                ]
            }
        ]
    }
}

// 针对vue-loader v16到目前最新版本

//在这个版本的vue-loader就很友好了，实际上你对js文件的规则配置也同样适用于vue文件里的script部份和template部份了。因此只需要在原来配置js文件的规则添加多一个i18n-auto-webpack/loader即可。
module.exports = {
    module: {
        rules: [
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'i18n-auto-webpack/loader',
                        options: i18nAutoLoaderOptions
                    },
                    {
                        loader: 'babel-loader'
                    }
                ]
            }
        ]
    }
}
```
你可能会看到这么多版本的`vue-loader`怎么使用我这个`i18n-auto-webpack/loader`还不同的写法，觉得好像好复杂似的。但是这并不是我这个`loader`的问题，我的`loader`负责的事情是很简单单一的，就是把`Javascript`的代码中找出中文替换而已。因此使用它的写法不同取决于它的上游`loader`，这是上游`loader`的责任，这里就是`vue-loader`的责任了，谁让它改版没有向前兼容。

理论上`i18n-auto-webpack/loader`是可以对任何前端框架或语言进行使用的，只要有合适的`loader`将其转换成`Javascript`后使用。

### 配置plugin
在webpack的配置中进行如下设置
```js
import i18nAutoPlugin from 'i18n-auto-webpack/plugin'

module.exports = {
    plugins: [
        new i18nAutoPlugin({
            watch: true
        })
    ]
}
```
是否监听更新，若设置`true`，则开发者编写代码每触发一次热更新，就收集一次代码中新增的中文词条更新到配置文件中。若设置为`false`，则只对第一次启动工程构建的文件进行收录词条创建配置文件，后续开发中新增的不会更新到配置文件中。默认为`false`

plugin更多配置请查阅 [plugin配置表](https://github.com/pekonchan/i18n-auto-webpack#plugin)

### 配置翻译
要开启自动翻译功能，需要在`i18nauto.config.js`中进行相应的设置。
```js
const {resolve} = require('path')
const rootPath = process.cwd()

module.exports = {
    // 翻译的常用配置
    translate: {
        on: true, // 是否开启翻译
        lang: ['en'], // 要翻译成哪些语言
        path: resolve(rootPath, './lang'), // 生成的翻译文件所在目录
        secretId: 'your secretId' // 必填。翻译api所需的你用户信息secretId
        secretKey: 'your secretKey' // 必填。翻译api所需的你用户信息secretKey
    }
}
```

本工具采用的翻译api是腾讯翻译。至于为什么选择腾讯翻译，当然有做过各种翻译api的调研，最后发现还是腾讯翻译的api相对来讲使用起来会更加有优势（除去翻译结果外，谁更准我这英语业务水平不好判断）

> 当你项目有大量词条需要被翻译时，其实你更多的不会关心翻译出来的是否准确，基本差不了哪里去的。如果你觉得个别翻译不准，可自己手动在翻译出来生成的配置文件中修改就可以了。本身不论你是用哪个api，最终还是需要有一个人工的校正工作。

因为采用的是第三方的翻译api，现在所有的翻译api都是要求注册用户获取授权才能调用的，而且免费用户都是有使用额度的。所以要想使用这个工具的翻译能力，首先使用者需要去注册腾讯云的机器翻译，获取`secretId`和`secretKey`写在配置文件里。

可能有人就会问为啥我这个工具自身里面用注册过的用户身份去调取api，而要每个使用者自己提供用户身份。首先，大家可以去查一下，基本实现翻译的工具类库，都是会要求使用者提供用户身份Id的，不可能工具内部用一个帐号去帮大家调用api的，因为api是需要收费的，一个月内有免费的额度。如果大家都用一个帐号，那么这个费用就很高了，而且还要类库的开发者自己承担。其次，用户身份是很重要的，需要用户自己保管，类库开发者不能把用户身份信息暴露在源代码中。

> 出于安全考虑，当你的项目工程代码是公网公开的，请勿把你或你公司的帐号的`secretId`和`secretKey`直接写在`i18nauto.config.js`中，请使用环境变量进行替代，读取本地机器上的环境变量。或者是把`i18nauto.config.js`文件设置在`.gitignore`中进行git版本控制忽略。这样就不会存在别人盗用你的帐号的风险。

#### 获取`secretId`和`secretKey`

先访问[腾讯云控制台](https://console.cloud.tencent.com/cam)，进行注册登陆。

进入用户-用户列表，找到对应用户（若无则新建用户）。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/94c1832a26b342f081a3db6eb99ccccd~tplv-k3u1fbpfcp-watermark.image?)

点击进入用户详情，选择进入API密钥导航

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3092fdcadb994b65811974b0b9a74b5f~tplv-k3u1fbpfcp-watermark.image?)

可以看到截图左下角有个密钥列。这里面就可以找到`secretId`和`secretKey`了。

#### 翻译api的限制
腾讯机器翻译api有两个限制需要我们留意下的：
- 文本翻译的每月免费额度为5百万字符。
- 1秒内请求api不得超过5次。

其实一般来讲，每月免费额度为5百万字符是够用的，一个项目中中文大部份应该不会超过5百万字符，假设真的超过了，可以考虑分月分批翻译。

为了让使用者用该工具更安心，我这边提供了两个配置项用于设置当翻译超过你指定的字符数限制时，停止调用翻译api。具体可查看 [startTotal和endTotal说明](https://github.com/pekonchan/i18n-auto-webpack#i18nautoconfigjs)

> 注意这个数量，是按照翻译语言种类来统计的。例如“你好啊”这个要翻译成英文和德文，那么就是 3 * 2 = 5，这个就消耗了5个字符的额度了。 3是中文的字符数，2的翻译成两个语种。

而第二个限制，`i18n-auto-webpack`这个工具内部已经实现了节流以满足这个条件要求。但是正因为此举，假设你的编码IDE是设置了自动保存的，而你边敲代码边自动保存触发了重新编译，就会触发收录中文词条，收录到了新的中文词条就会触发了翻译，若你保存次数很多很快，就会频繁触发翻译接口，而`i18n-auto-webpack`因为做了节流处理，就会可能导致翻译没那么实时，这是无法避免的。加上我们敲代码可能会输错或者来回改动，触发翻译越多，翻译字符数量也会上升，而免费额度只有5百万字符。

因此，对于这两个限制条件来讲，**要开启自动翻译功能，我的建议是**
1. 要么你的编码IDE设为手动保存减少频繁触发热更新；（最佳实践）
2. 要么把loader和plugin部分的`watch`配置设置为`false`，不要实时监听变化而更新；
3. 要么把自动翻译功能关闭，选择`i18n-auto-webpack`提供的单独翻译能力`i18n-auto-webpack/translate`方法，编写命令，在你想要翻译的时候手动触发该命令进行翻译。（最稳妥方案）

关于使用单独的翻译能力，请查阅下面的[`独立翻译函数`](https://github.com/pekonchan/i18n-auto-webpack#%E7%8B%AC%E7%AB%8B%E7%BF%BB%E8%AF%91%E5%87%BD%E6%95%B0)介绍


> 至此，上述介绍的配置，是可以快速实现自动化国际化的简单配置。若想了解更多功能和定制化，可继续查阅下属的[详细配置表](https://github.com/pekonchan/i18n-auto-webpack#%E8%AF%A6%E7%BB%86%E9%85%8D%E7%BD%AE%E8%A1%A8)

### 独立翻译函数

使用`i18n-auto-webpack/translate`提供的能力，能够单独编写脚本实现翻译能力。

这样就能够依赖它来编写`nodejs`脚本，然后写在`npm script`里写个命令，专门在开发者基本编写好代码后，运行命令做最后的统一翻译。这样就可以关闭自动翻译，能规避翻译api的条件限制导致的一些问题（见上节内容[翻译api的限制](https://github.com/pekonchan/i18n-auto-webpack#%E7%BF%BB%E8%AF%91api%E7%9A%84%E9%99%90%E5%88%B6)）

或者你已经做好国际化的方案了，已经实现了代码替换和收录中文了，剩下的就只有翻译工作还没做，还没生成翻译语言的配置文件，那么你也可以使用`i18n-auto-webpack/translate`来帮你完成这一步工作。

> 如果想单独使用这个翻译能力，仍然需要配合`i18nauto.config.js`文件使用，需要设置翻译接口所需的你的`secretId`和`secretKey`
    
#### 使用示例

```js
// 引入翻译方法
const { createTranslate } = require('i18n-auto-webpack/translate')

const path = require('path')

// 翻译的目标配置
const target = {
    path: path.resolve(__dirname), // 翻译的结果放在哪个目录中
    lang: ['en'] // 要翻译出来的语言
}
// 翻译的源内容配置
const source = {
    path: path.resolve(__dirname, 'zh.json') // 根据哪个中文配置文件来生成对应的国际化语言配置文件
}

// 执行该方法后翻译结果会自动创建/修改到指定的目录中
createTranslate(target, source)
```

#### 入参

方法的参数功能介绍：

一共三个入参，按顺序如下 `target`, `source`, `needFile`

关于`<Obejct>target`：

属性名 | 类型 | 功能描述 | 默认值 | 是否必填
--- | --- | --- | --- | --- |
path | String | 翻译文件的目录绝对路径，不包含文件名的 | 运行该方法的路径 + lang目录，没有则会自动创建该目录 | 否
lang | Array | 翻译语言列表 | ['en'] | 否
nameRule | Function | 设置翻译文件的名称格式 | lang + '.json' | 否

关于`<Obejct>source`：

属性名 | 类型 | 功能描述 | 默认值 | 是否必填
--- | --- | --- | --- | --- |
path | String | 翻译来源文件的目录绝对路径，包含文件名的 | - | 是

关于`needFile`

`Booealn`类型，默认是`true`。 

代表是否需要把翻译的结果生成到指定的目录中
- 若存在同名文件，则会根据已存在的文件内容来判断哪些中文需要进行翻译，然后把翻译结果合并到该文件里。
- 若不存在同名文件，则会直接把所有中文翻译后创建出来。

#### 返回值
返回的是`Promise`。返回的回调结果是一个对象，以翻译的语言为`key`，翻译结果为`value`，如 
```
en: {
    1: 'hello',
    2: 'Who am i'
}
```


## 单独的能力
使用`i18n-auto-webpack`可以使用它的完整功能，但是可能有部分人仅仅是看中了该工具的其中某个能力，而不需要使用它的全部功能。

### 仅收录中文词条
开发者有需求仅仅是想收录项目代码中的中文词条，生成配置文件，而不需要转换代码中的中文词条，不想通过编译时转换代码这种方式。

那么就可以在使用`i18n-auto-webpack/loader`时设置`transform: false`。
```javascript
module.exports = {
    module: {
        rules: [
            {
                test: /\.js$/,
                loader: 'i18n-auto-webpack/loader',
                options: {
                    transform: false
                }
            }
        ]
    }
}
```

### 仅使用翻译能力
若你已经实现了国际化方案，你已经做好了收录中文词条和转换代码的工作了，剩下的也只是想要把自己收录好的中文翻译成其他语言，还差这一步工作。

或者你正在寻找一个类库想实现翻译功能，去做别的需求。

那么`i18n-auto-webpack/translate`可以帮到你，我把该工具使用到的翻译能力单独抽离出来，可以当成独立的类库进行使用。

具体使用方法可参考[独立翻译函数](https://github.com/pekonchan/i18n-auto-webpack#%E7%8B%AC%E7%AB%8B%E7%BF%BB%E8%AF%91%E5%87%BD%E6%95%B0)

### 生成映射文件
当你有需求想要知道项目里的哪些文件有中文词条，有什么中文词条，而且它在该文件中出现的次数是多少。

那么可以设置`sourceMap: true`达到该目的。
```js
const i18nAutoPlugin = require('i18n-auto-webpack/plugin')
module.exports = {
    plugins: [
        new i18nAutoPlugin({
            sourceMap: true
        })
    ]
}
```

## 特殊情况

当你有不得不需要在代码中直接使用国际化转换函数的时候，你仍然可以放心大胆使用。例如
```
// i18n.tc是国际化转换函数
const word = i18n.tc('1')
```
对应的词条表中是
```json
// zh.json
{
    "1": "你好"
}
```
`i18n-auto-webpack`会自动根据你在`loader`中设置的国际化转换依赖的`name`值来判断你调用的方法是否为国际化转换函数，是的话，词条表中会为你保留对应的词条，而不会说因为代码中没有这个中文，会在词条表中删除对应的词条。当然，这时候你需要自己手动在词条表中设置对应的词条了。
```js
module.exports = {
    module: {
        rules: [
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'i18n-auto-webpack/loader',
                        options: {
                            watch: true,
                            name: 'i18n.tc', // 就是这个名字来判断
                            dependency: {
                                name: 'i18n',
                                value: 'src/common/i18n.js'
                            }
                        }
                    }
                ]
            }
        ]
    }
}
```
这种场景更多是的，你需要使用国际化转换函数传递更丰富的参数完成更丰富的能力、或者是带有`html`标签的字符串需要直接渲染出来的（类似`vue`的`v-html`），如果你不自己处理成写成国际化转换函数的形式，那么就会把`html`的标签也当成词条的一部分进行提取和翻译，可能会破坏你的逻辑。

若你使用国际化转换函数不仅仅是用`name`指定的方式调用，还有其他方式调用， 你也想保留对应的key的词条，那么可以使用`alias`配置，指定它的其他调用方式。例如使用了`vue-i18n`，可以直接在组件中用`this.$t()`来调用转换，此时你可设置`alias: ['$t', '_vm.$t']`来保留调用它的key对应的词条：
```
{
    loader: 'i18n-auto-webpack/loader',
    options: {
        watch: true,
        name: 'i18n.tc',
        alias: ['$t', '_vm.$t'],
        dependency: {
            name: 'i18n',
            value: 'src/common/i18n.js'
        }
    }
}
```
此时代码中使用`i18n.tc`和`$t`的方法内key对应的词条都将保留。

此外，

使用`i18n-auto-webpack`是一个提高工作效率的工具，也能相对成功找到代码中中文的词条进行替换，但是各种开发者写的各种代码，会存在各种可能性，我这边只能说把大部分常规场景都囊括进来，若你遇到特殊的写法或场景，使用该工具无法成功提取到中文，请告诉我，我将进行补充，或者你可能需要调整为直接在代码中使用国际化转换函数的写法。项目代码中存在直接使用国际化转换函数+中文（`i18n-auto-webpack`帮忙收录国际化）的场景是无法避免的。

## 详细配置表

### i18nauto.config.js
| 配置项 | 描述 | 类型 | 必填 | 默认值 |
| ----- | --- | ---  | --- | ----- |
| `entry` | 词条配置表的入口文件配置。因为编译转译代码时，需要知道已有配置表对应词条的key值，所以要先指定一个配置表文件先。注意这个文件是你要收集的语言的配置表，而不是翻译后的其他语言配置表，**有以下属性：**| Object | 是 |  |
|        | `path`：配置表文件的所属路径（不含文件名） | String | 否 | 项目根目录/lang |
|        | `filename`：配置表文件的文件名（不含路径） | String | 否 | zh.json                 |
| `output` | 生成代码中收录的词条配置表文件信息，**有以下属性：** | Object | 否 | 跟当设置了`entry`，没有设置`output`，那么跟随`entry`设置 |
|        | `path`：配置表文件的所属路径（不含文件名） | String | 否 | 项目根目录/lang |
|        | `filename`：配置表文件的文件名（不含路径） | String | 否 | zh.json                 |
| `localePattern` | 收录的语言正则表达式，默认是收录中文。所以你想收录其他语言，可根据实际传入可代表其他语言的正则表达式 | RegExp | 否 | `/[\u4e00-\u9fa5]/` |
| `translate` | 设置自动翻译相关，**有以下属性：** | Object | 否 | false，不开启自动翻译 |
|             | `on`：是否开启翻译 | Boolean | 否 | false |
|             | `lang`：要翻译成哪些语言 | Array | 否 | ['en'],英文。语言的标识可参考[api](https://cloud.tencent.com/document/api/551/40566) |
|             | `path`：生成的翻译文件所在目录 | String | 否 | 项目根目录/lang |
|             | `nameRule`：生成的翻译文件名 | Function | 否 | nameRule (lang) {return lang + '.json' } |
|             | `startTotal`：表示你已经使用了多少字符额度了，本次启动服务触发的翻译字符数，将基于这个额度上进行计算 | Number | 否 | 0 |
|             | `endTotal`：当达到了指定的endTotal额度限制时，就不再触发翻译请求了。默认值就是腾讯翻译api的免费额度，不想限制传`Infinity` | Number | 否 | 5000000 |
|             | `secretId`：翻译api的用户身份secretId，请去腾讯云控制台查阅 | String | 是 |  |
|             | `secretKey`：翻译api的用户身份secretKey，请去腾讯云控制台查阅 | String | 是 |  |
|             | `region`：对哪个地区的语言进行翻译 | String | 否 | ap-beijing |
|             | `endpoint`：接口请求地址 | String | 否 | tmt.tencentcloudapi.com |
|             | `source`：要进行翻译的语言 | String | 否 | zh |
|             | `projectId`：项目ID，可以根据控制台-账号中心-项目管理中的配置填写，如无配置请填写默认项目ID:0 | Number | 否 | 0 |

关于`startTotal`和`endTotal`

因为腾讯翻译api一个月有免费的翻译文本数量限制，最多5百万字符，若超出，则需要付费了。所以`startTotal`和`endTotal`的设置会让你使用得更安心些。注意，`startTotal`只会从本次启动服务（如启动了dev-server）基于它进行累计计算。我们并不会知道之前的服务你使用了多少额度，所以你可能每次启动服务的时候都需要修改这个`startTotal`

> 可惜的是腾讯机器翻译api暂时还没有api可以查询用户使用额度

关于`translate`下的子属性，从`secretId`开始，都是遵循腾讯云翻译api的要求的配置。若想了解更多，可查阅 [腾讯云翻译api文档](https://cloud.tencent.com/document/api/551/40566)

### loader
| 配置项     | 描述                                                         | 类型    | 必填                       | 默认值 |
| ---------- | ------------------------------------------------------------ | ------- | -------------------------- | ------ |
| `includes`   | 支持实现国际化的文件(夹)，元素值为文件（夹）的绝对路径  ，若为文件夹地址，请以`/`结尾，则文件夹下的文件都会实现国际化。可搭配`excludes`使用，`excludes`的优先级更高。             | Array   | 否                         | []     |
| `excludes`   | 排除实现国际化的文件(夹)，元素值为文件（夹）的绝对路径  ，若为文件夹地址，请以`/`结尾，则文件夹下的文件都会被排除。可搭配`includes`使用，`excludes`的优先级更高。                 | Array   | 否                         | []     |
| `dependency` | 转译成国际化所需代码时，若你需要在这个文件中引入某些依赖，则可用该配置。目前只支持引入单个文件，后续需优化成支持多个，数组形式。有以下属性： | Object  | 否                         |        |
|            | `name`：引入的依赖所赋予的变量名，如`import name from 'xxx'`，就是这里的`name` | String  | 当设置了dependency，则必填 |        |
|            | `value`：引入的依赖的路径，可以是任意格式的路径，实际上就是一个字符串，就跟你要写在代码里的`import`或`require`方法的路径是一样的即可。注意这个值会用来判断文档当前是否已经引入过该依赖的，判断的依据是直接根据这个路径字符串完全匹配判断，而不是跟实际引入文件判断，一个文件的引入路径写法不一样，会造成判断不准 | String  | 当设置了dependency，则必填 |        |
|            | `objectPattern`：引入的依赖的形式。若是解构格式，则需要设置为true。 | Boolean  | 否 | |
| `name` | 替换代码中词条的实现国际化的函数调用完整路径名 | String  | 是                         |        |
| `alias` | 替换代码中词条的实现国际化的函数调用完整路径名的别称 | Array  | 否                         |        |
| `watch` | 是否实时监听文件变化，实时更新对应于配置表中的key值 | Boolean | 否 | false |
| `transform` | 是否需要转换代码。若你仅仅想收录项目中的词条，而不转换代码，可设置为false | Boolean | 否 | true |

### plugin
| 配置项    | 描述                                                         | 类型            | 必填 | 默认值            |
| --------- | ------------------------------------------------------------ | --------------- | ---- | ----------------- |
| `output`    | 生成的配置表文件信息，优先级比全局配置文件`i18nauto.config.js`高，有以下属性： | Object          | 否   |                   |
|           | `path`：配置表文件的所属路径（不含文件名）                     | String          | 否   |  |
|           | `filename`：配置表文件的文件名（不含路径）                     | String          | 否   | |
| `watch` | 是否实时监听文件变化，实时更新配置文件。主要是针对开发环境启动后。当`watch`为`Object`时，有以下属性： | Object \| Boolean | 否 | false |
|           | `on`：是否开启监听 | Boolean | 否 | false |
| `sourceMap` | 是否生成映射表。当`sourceMap`为`Object`时，有以下属性： | Object \| Boolean | 否   | false |
|           | `on`：是否生成词条映射表，记录哪个文件有哪些词条 | Boolean | 否 | false             |
|           | `path`：生成的映射文件存放路径（不含文件名）                 | String          | 否   | 项目根目录/lang   |
|           | `filename`：生成的映射文件名（不含路径）                     | String          | 否   | zh.sourcemap.json |

不论怎样，第一次启动项目，如开发环境下启动项目，或打包生产环境，必然会根据实际情况需要看是否更新一次词条配置表。

# 最后
关于我提供的`i18n-auto-webpack`的前因后果都介绍清楚完毕了。如果大家感兴趣的话，使用它时遇到什么问题，欢迎提问题，我将尽最大能力为大家解答。

喜欢的话，麻烦[github](https://github.com/pekonchan/i18n-auto-webpack)上点个赞吧，谢谢大家
