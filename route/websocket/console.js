const {
    WebSocketObserver
} = require('../../model/WebSocketModel');
const counter = require('../../core/counter');
const response = require('../../helper/Response');
const serverModel = require('../../model/ServerModel');
const userModel = require('../../model/UserModel');
const permssion = require('../../helper/Permission');

const BASE_RECORD_DIR = "./server/record_tmp/";

//日志缓存记录器
MCSERVER.consoleLog = {};

//控制台信息广播
function selectWebsocket(serverName, callback) {
    let all = MCSERVER.allSockets;
    for (let k in all) {
        if (all[k]['console'] === serverName) {
            callback(all[k]);
        }
    }
}

//服务器异常
serverModel.ServerManager().on('error', (data) => {
    MCSERVER.infoLog('Error'.red, '[' + data.serverName + '] >>> 异常', true);
    selectWebsocket(data.serverName, (socket) => {
        response.wsMsgWindow(socket.ws, "服务器异常:" + data.msg);
    });
})

//服务器退出
serverModel.ServerManager().on('exit', (data) => {
    MCSERVER.log('[' + data.serverName + '] >>> 进程退出');
    let server = serverModel.ServerManager().getServer(data.serverName);
    if (server.dataModel.autoRestart) {
        //自动重启
        setTimeout(() => {
            serverModel.startServer(data.serverName);
        }, 5000);
        selectWebsocket(data.serverName,
            (socket) => response.wsMsgWindow(socket.ws, '检测到服务器关闭，稍后将根据任务自动重启！'));
        return;
    }
    //输出到标准输出
    server.printlnCommandLine('服务端 ' + data.serverName + " 关闭.");

    selectWebsocket(data.serverName,
        (socket) => response.wsMsgWindow(socket.ws, '服务器关闭'));

    // 传递服务器关闭事件
    serverModel.ServerManager().emit("exit_next", data);
})

//服务器开启
serverModel.ServerManager().on('open', (data) => {
    MCSERVER.log('[' + data.serverName + '] >>> 进程创建');
    // 传递开启服务端事件
    serverModel.ServerManager().emit("open_next", {
        serverName: data.serverName
    });
    // 仅发送给正在监听控制台的用户
    selectWebsocket(data.serverName, (socket) => {
        response.wsMsgWindow(socket.ws, '服务器运行');
        // 传递服务器开启事件
    });
})


//控制请求监听控制台实例
WebSocketObserver().listener('server/console/ws', (data) => {

    let userName = data.WsSession.username;
    let serverName = data.body.trim();

    if (permssion.isCanServer(userName, serverName)) {
        MCSERVER.log('[' + serverName + '] >>> 准许用户 ' + userName + ' 控制台监听');

        //设置监听终端
        data.WsSession['console'] = serverName;
        return;
    }

    MCSERVER.log('[' + serverName + '] 拒绝用户 ' + userName + ' 控制台监听');
    data.WsSession['console'] = undefined;
});

//前端退出控制台界面
WebSocketObserver().listener('server/console/remove', (data) => {
    //单页退出时触发
    for (let k in MCSERVER.allSockets) {
        if (MCSERVER.allSockets[k].uid == data.WsSession.uid) {
            MCSERVER.allSockets[k]['console'] = undefined;
            return;
        }
    }
});


//缓冲区定时发送频率，默认限制两秒刷新缓冲区
let consoleBuffer = {};
setInterval(() => {
    for (const serverName in consoleBuffer) {
        let data = consoleBuffer[serverName];

        data = data.replace(/\n/gim, '\r\n');
        data = data.replace(/\r\r\n/gim, '\r\n');
        //刷新每个服务器的缓冲数据
        selectWebsocket(serverName, (socket) => {
            socket.send({
                ws: socket.ws,
                resK: 'server/console/ws',
                resV: {},
                body: data
            });
        });
        // 释放内存
        consoleBuffer[serverName] = "";
    }
}, MCSERVER.localProperty.console_send_times);
//控制台标准输出流
serverModel.ServerManager().on('console', (data) => {
    // 加入到缓冲区
    if (!consoleBuffer[data.serverName]) consoleBuffer[data.serverName] = "";
    consoleBuffer[data.serverName] += data.msg;
});


const {
    autoLoadModule
} = require("../../core/tools");
autoLoadModule('route/websocket/console', 'console/', (path) => {
    require(path);
});