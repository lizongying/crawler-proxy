/**
 * Created by michael on 2016-08-11.
 */
var crawler = require('crawler');
var qs = require('querystring');
var mysql = require('mysql');

var env = 'production';//环境 test或production

var host ='';//数据库地址
var port = 3306;//数据库端口
var user = '';//数据库用户名
var password = '';//数据库密码
var database = '';//数据库名
var table = '';//表名
var uri = 'http://dafault.com/ip/?';//api地址
var uriCheck = 'http://www.baidu.com';//验证地址
var ipStage = 1;//ip已验证状态
var tid = '559655993046570';//api订单号
var num = '10';//每次获取数量
var delay = '1';//延迟要求
var maxConnections = 10;//最大连接
var ipCountMax = 100000;//ip最大数量
var userAgent = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36';//页头
var timeout = 10000;//超时 ms 默认60000
var retries = 0;//重试次数 默认3
var retryTimeout = 10000;//重试超时 ms 默认10000
var getListInterval = 8000;//获取列表时间间隔 ms
var showLogInterval = 1000;//显示log时间间隔 ms

var reqCurrentCount = 0;//当前队列数量
var reqAllCount = 0;//全部请求数量
var reqIPCount = 0;//IP请求数量
var rspIPCount = 0;//IP返回数量
var noneIPErrorCount = 0;//IP返回错误数量
var stateIPErrorCount = 0;//IP状态错误数量
var formatIPErrorCount = 0;//IP格式错误数量
var saveIPErrorCount = 0;//IP保存错误数量
var saveIPSuccessCount = 0;//IP保存成功数量
var reqListCount = 0;//列表请求数量
var rspListCount = 0;//列表返回数量
var noneListErrorCount = 0;//列表返回错误数量
var stateListErrorCount = 0;//列表状态错误数量
var formatListErrorCount = 0;//列表格式错误数量
var ipListAll = [];//IP历史列表

//验证ip 并加入数据库
function check_ip(error, result) {
    if (error) {
        noneIPErrorCount++;
        crawler_log('debug', 'IP返回错误', error);
        crawler_log('debug', 'IP返回错误数量', noneIPErrorCount);
        return;
    }

    if (result.statusCode != 200) {
        stateIPErrorCount++;
        crawler_log('debug', 'IP状态错误', result.statusCode);
        crawler_log('debug', 'IP状态错误数量', stateIPErrorCount);
        return;
    }

    var ip = result.options.proxies[0];
    crawler_log('debug', 'IP', ip);

    var time = new Date().getTime().toString().substr(0, 10);

    if (ip.length < 8) {
        formatIPErrorCount++;
        crawler_log('debug', 'IP格式错误', 'IP格式错误');
        crawler_log('debug', 'IP格式错误', result.body);
        crawler_log('debug', 'IP格式错误数量', formatIPErrorCount);
        return;
    }

    var addSql = 'INSERT INTO ' + table + '(' +
        'ip, ' +
        'state, ' +
        'updatetime, ' +
        'createtime' +
        ') VALUES (' +
        '?, ' +
        '?, ' +
        '?, ' +
        '?' +
        ')';

    var addParams = [
        ip,
        ipStage,
        time,
        time
    ];

    client.query(addSql, addParams, function (err, res) {
        if (err) {
            saveIPErrorCount++;
            crawler_log('debug', 'IP保存错误', err.message);
            crawler_log('debug', 'IP保存错误数量', saveIPErrorCount);
        } else {
            saveIPSuccessCount++;
            crawler_log('debug', 'IP保存成功', res.insertId);
            crawler_log('debug', 'IP保存成功数量', saveIPSuccessCount);
        }
    });
}

//获取列表
function get_list() {

    //加入请求队列
    c.queue([{
        uri: uri,
        callback: function (error, result) {
            rspListCount++;
            crawler_log('debug', '列表返回数量', rspListCount);

            reqCurrentCount--;
            crawler_log('debug', '当前队列数量', reqCurrentCount);

            if (error) {
                noneListErrorCount++;
                crawler_log('debug', '列表返回错误', error);
                crawler_log('debug', '列表返回错误数量', noneListErrorCount);

                //获取列表
                setTimeout(get_list, getListInterval);
                return;
            }

            if (result.statusCode != 200) {
                stateListErrorCount++;
                crawler_log('debug', '列表状态错误', result.statusCode);
                crawler_log('debug', '列表状态错误数量', stateListErrorCount);

                //获取列表
                setTimeout(get_list, getListInterval);
                return;
            }

            var regError = /ERROR(?:(\s*)[^\s]+)/g;
            if (regError.test(result.body)) {
                formatListErrorCount++;
                crawler_log('debug', '列表格式错误', result.body);
                crawler_log('debug', '列表格式错误数量', formatListErrorCount);

                //获取列表
                setTimeout(get_list, getListInterval);
                return;
            }

            var ipList = result.body.split("\r\n");
            crawler_log('debug', 'IP列表', ipList);

            var ipListCount = ipList.length;
            var ipListCurrent = [];

            //验证是否存在过 只验证当前队列中的
            for (var i = 0; i < ipListCount; i++) {

                //待验证ip
                var ckIP = ipList[i];

                //TO DO 验证数据库中是否存在

                //如果存在退出循环
                if (ipListAll.indexOf(ckIP) > -1) {
                    crawler_log('debug', 'ip列表已存在', ckIP);
                    continue;
                }

                //如果超出最大，新的替换旧的
                if (ipListAll.length > ipCountMax) {
                    ipListAll.shift();
                    crawler_log('debug', 'ip列表已超过最大值', ckIP);
                }

                ipListAll.push(ckIP);
                ipListCurrent.push(ckIP);
            }

            var ipListCurrentCount = ipListCurrent.length;
            crawler_log('debug', 'IP本次请求数量', ipListCurrentCount);

            if (ipListCurrentCount === 0) {

                //获取列表
                setTimeout(get_list, getListInterval);
                return;
            }
            var ipCount = 0;

            //开始请求
            for (var i = 0; i < ipListCurrentCount; i++) {

                //待请求ip
                var url = 'http://' + ipListCurrent[i];

                //加入请求
                c.queue([{
                    uri: uriCheck,
                    proxies: [url],
                    callback: function (err, res) {
                        ipCount++;
                        crawler_log('debug', 'IP本次返回数量', ipCount);

                        rspIPCount++;
                        crawler_log('debug', 'IP返回数量', rspIPCount);

                        reqCurrentCount--;
                        crawler_log('debug', '当前队列数量', reqCurrentCount);

                        if (ipCount === ipListCurrentCount) {

                            //获取列表
                            get_list();
                        }
                        check_ip(err, res);
                    }
                }]);

                reqCurrentCount++;
                crawler_log('debug', '当前队列数量', reqCurrentCount);

                reqIPCount++;
                crawler_log('debug', 'IP请求数量', reqIPCount);

                reqAllCount++;
                crawler_log('debug', '全部请求数量', reqAllCount);
            }
        }
    }]);

    reqCurrentCount++;
    crawler_log('debug', '当前队列数量', reqCurrentCount);

    reqListCount++;
    crawler_log('debug', '列表请求数量', reqListCount);

    reqAllCount++;
    crawler_log('debug', '全部请求数量', reqAllCount);
}

//log
function crawler_log(level, title, content) {

    //判断环境
    switch (env) {
        case 'test':
            switch (level) {
                case 'debug':
                    console.log(title, content);
                    break;
                case 'info':
                    console.log(title, content);
                    break;
                default :
                    break;
            }
            break;
        case 'production':
            switch (level) {
                case 'debug':
                    break;
                case 'info':
                    console.log(title, content);
                    break;
                default :
                    break;
            }
            break;
        default :
            console.log(title, content);
            break;
    }
}

//显示log
function show_log () {
    crawler_log('info', '当前队列数量    ', reqCurrentCount);
    crawler_log('info', '全部请求数量    ', reqAllCount);
    crawler_log('info', '列表请求数量    ', reqListCount);
    crawler_log('info', '列表返回数量    ', rspListCount);
    crawler_log('info', '列表返回错误数量', noneListErrorCount);
    crawler_log('info', '列表状态错误数量', stateListErrorCount);
    crawler_log('info', '列表格式错误数量', formatListErrorCount);
    crawler_log('info', 'IP请求数量      ', reqIPCount);
    crawler_log('info', 'IP返回数量      ', rspIPCount);
    crawler_log('info', 'IP返回错误数量  ', noneIPErrorCount);
    crawler_log('info', 'IP状态错误数量  ', stateIPErrorCount);
    crawler_log('info', 'IP格式错误数量  ', formatIPErrorCount);
    crawler_log('info', 'IP保存错误数量  ', saveIPErrorCount);
    crawler_log('info', 'IP保存成功数量  ', saveIPSuccessCount);
    crawler_log('info', '################', '################');
}

//api地址初始化
uri += qs.stringify({
    tid: tid,
    num: num,
    delay: delay
});

//数据库初始化
var client = mysql.createConnection({
    host: host,
    port: port,
    user: user,
    password: password
});
client.connect();
client.query("use " + database);

//爬虫初始化
var c = new crawler({
    maxConnections: maxConnections,
    userAgent: userAgent,
    timeout: timeout,
    retries: retries,
    retryTimeout: retryTimeout,
    jQuery: false
});

//获取列表
get_list();

//展示log
setInterval(show_log, showLogInterval);