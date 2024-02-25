const request = require("request");
const inquirer = require('inquirer');
const md5 = require('md5');

let timer = null

const version = 'v1.0'

let globalData = {}

let logNum = 0

// lbd2023_5@163.com   wish0000.... 17.07

const logger = (str, type = 'default') => {
  const date = new Date()
  const tag = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}[${version}]`
  let log;
  if (type === 'default') {
    log = '\033[42;30m '+tag+' \033[0m ' + str;
  } else if (type === 'success') {
    log = '\033[42;30m '+tag+' \033[;32m '+str+ ' \033[0m'
  } else if (type === 'danger') {
    log = '\033[42;30m '+tag+' \033[;31m '+str+' \033[0m'
  }
  logNum += 1;
  if (logNum >= 1000) {
    console.clear()
    logNum = 0
  }
  console.log(log)
}


const getCookieValue = (cookieStr, cookieName) => {
  const cookies = cookieStr.split(';');
  for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      // 检查是否以指定的cookieName开头
      if (cookie.startsWith(cookieName + '=')) {
          // 返回键值对的值
          return cookie.split('=')[1];
      }
  }
  // 如果找不到指定的cookieName，返回空字符串或其他默认值
  return '';
}

const refreshCookie = (headers) => {
  const cookies = headers['set-cookie']
  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i]
    const cookie = c.split(';')[0]
    const key = cookie.split('=')[0]
    const value = cookie.split('=')[1]
    globalData.cookie = globalData.cookie.replace(getCookieValue(globalData.cookie, key), value)
  }
}

const httpGet = (source_url, otherUrl, method, data, first) => {
  return new Promise((resolve, reject) => {
    const source_token = getCookieValue(globalData.cookie, '_m_h5_tk');
    if (!source_token) {
      closeTimer()
      throw new Error('cookie异常，请重新获取')
    }
    const token = source_token.split('_')[0]
    const date = new Date().getTime()
    const appKey = '30267743';

    const sign = md5(`${token}&${date}&${appKey}&${data}`)

    let url = 'https://seller-acs.aliexpress.com/h5/'+source_url+'/1.0/?'
    url += 'jsv=2.3.16&'
    url += 'appKey='+appKey+'&'
    url += 't='+date+'&'
    url += 'sign='+sign+'&'
    url += 'v=1.0&'
    url += 'timeout=30000&'
    url += 'type=originaljson&'
    url += 'method='+method+'&'
    url += 'contentType=application/x-www-form-urlencoded;charset=utf-8&'
    url += 'withCredentials=true&'
    url += 'api='+source_url+'&'
    url += 'headers=%5Bobject%20Object%5D&'
    url += 'dataType=json&'
    url += 'valueType=original&'
    url += 'x-i18n-regionID=AE&'

    if (otherUrl) {
      url += otherUrl
    }

    if (method === 'GET') {
      url += 'data=' + data
    }

    const options = {
      'method': method,
      'url': url,
      'headers': {
        'Cookie': globalData.cookie,
        'Origin': 'https://csp.aliexpress.com',
        'Referer': 'https://csp.aliexpress.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Host': 'seller-acs.aliexpress.com'
      }
    };
    if (method === 'POST') {
      options.body = 'data=' + data
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    request(options, async function (error, response) {
      if (error) throw new Error(error);
      try {
        const jsonData = JSON.parse(response.body)
        if (!jsonData.data.data) {
          if (jsonData.ret[0] === 'FAIL_SYS_TOKEN_EXOIRED::令牌过期' && first) {
            logger('令牌过期，重新刷新中', 'danger')
            await refreshCookie(response.headers);
            const fetchRes = await httpGet(source_url, otherUrl, method, data, false)
            resolve(fetchRes)
            return
          }
          closeTimer()
          throw new Error("请求失败：" + JSON.stringify(jsonData))
        }
        resolve(jsonData.data.data)
      } catch (e) {
        closeTimer()
        throw new Error('JSON解析错误：' + e)
      }
    })
  })
  
}

/**
 * 暂停商品
 * @param {*} arr 需要暂停的数组
 */
const pauseShop = (arr) => {
  const param = `{"_timezone":-8,"unitIds":"[${arr.map(item => item.unitId)}]"}`
  const url = 'mtop.aliexpress.ad.bp.maxwell.offer.stop'
  const other_url = `H5Request=true&url=${url}&`
  httpGet(url, other_url, 'POST', param, true).then(e => {
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i]
      logger(`商品"${item.productId}/${item.solutionName}/点击量${item.click}/曝光量${item.exposure}"暂停成功`, 'success')
    }
  })
}

/**
 * 拿到符合条件的数据
 * @param {*} data 
 * @returns 
 */
const filterTgingList = (data) => {
  if (!data || !data.length) {
    return [];
  }
  const result = []
  for (let i = 0; i < (data || []).length; i++) {
    // 曝光量exposure 点击量click
    const item = data[i]
    if (item.exposure >= parseInt(globalData.bgl) || item.click >= parseInt(globalData.djl)) {
      result.push({
        productId: item.productId,
        solutionName: item.solutionName,
        unitId: item.unitId,
        solutionId: item.solutionId,
        click: item.click,
        exposure: item.exposure
      })
    }
  }
  return result
}

/**
 * 获取全部商品列表(推广中、实时数据)
 */
const getList = () => {
  // const param = `{"_timezone":-8,"sort":"{\\"exposure\\":\\"desc\\"}","pageSize":10,"current":1,"total":0,"status":"1","itemTimeRange":7,"groupDateRange":"2024-02-22,2024-02-23","searchStr":"","searchType":"name"}`;
  const param = `{"_timezone":-8,"sort":"{\\"click\\":\\"desc\\"}","pageSize":10,"current":1,"total":0,"status":"1","itemTimeRange":0,"groupDateRange":",","searchStr":"","searchType":"name"}`
  
  const url = 'mtop.aliexpress.ad.bp.maxwell.solutionunit.list.query'
  const other_url = `H5Request=${url}&`
  httpGet(url, other_url, 'GET', param, true).then(e => {
    logger("开始获取数据")
    const filter = filterTgingList(JSON.parse(JSON.stringify(e.dataSource)))
    if (!filter.length) {
      logger(`暂时没有达到曝光量：${globalData.bgl}或点击量：${globalData.djl}的商品`, 'danger')
    } else {
      pauseShop(filter)
    }
  })
}

const closeTimer = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const main = () => {
  logger(`AliExpress自动化工具-Mobai(${version})`)
  const questions = [
    {
        type: 'input',
        name: 'cookie',
        message: '请输入网站的cookie:'
    },
    {
        type: 'input',
        name: 'bgl',
        message: '请输入曝光量:'
    },
    {
        type: 'input',
        name: 'djl',
        message: '请输入点击量:'
    },
    {
        type: 'input',
        name: 'time',
        message: '请输入时间(分钟):'
    }
  ];
  inquirer.prompt(questions).then(answers => {
    if (!answers.cookie) {
      closeTimer()
      throw new Error('请输入网站的cookie')
    }
    if (!answers.bgl) {
      closeTimer()
      throw new Error('请输入曝光量')
    }
    if (!answers.djl) {
      closeTimer()
      throw new Error('请输入点击量')
    }
    if (!answers.time) {
      closeTimer()
      throw new Error('请输入时间')
    }
    globalData = JSON.parse(JSON.stringify(answers))
    closeTimer()

    getList()
    timer = setInterval(() => {
      getList()
    }, (Number(globalData.time) * 60 * 1000))
  });
}

main();
