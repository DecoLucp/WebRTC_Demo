## WebRTC_Demo

### 1. 服务端

#### 1.1 使用 nodejs 和 socket.io 实现信令服务器

![bs_序列图_测试版.jpg](https://s2.loli.net/2023/05/08/Tgsa6briHuzCMlV.jpg)

我们先设计一个信令：

1. 客户端信令消息

   - **join:** 当前用户和远端用户加入到房间中的信令

   - **leave:** 当前用户和远端用户离开房间的信令

   - **message:** 交换双方的 SDP、ICE 信令

2. 端到端信令消息

   - **Offer** 

   - **Answer** 

   - **Candidate** 

3. 服务端信令消息

   - **joined** 已加入房间 

   - **otherjoin** 其它用户加入房间 

   - **full** 房间人数已满 

   - **leaved** 已离开房间 

   - **bye** 对方离开房间 

首先需要搭建一个 **Node.js** 服务端，用于处理信令交换。使用 **socket.io** 库作为通信协议，借助 http、https、fs 等组件。实现一个简单的 **Node.js** 服务端实例：

```js
var log4js = require('log4js');
var http = require('http');
var https = require('https');
var fs = require('fs');
var socketIo = require('socket.io');

var express = require('express');
var serveIndex = require('serve-index');

var USERCOUNT = 3;

...

//http server
var http_server = http.createServer(app);
http_server.listen(80, '0.0.0.0');

var options = {
        key : fs.readFileSync('./cert/xxx.key'),
        cert: fs.readFileSync('./cert/xxx.pem')
}

//https server
var https_server = https.createServer(options, app);
var io = socketIo.listen(https_server);


io.sockets.on('connection', (socket)=> {
    socket.on('message', (room, data)=>{
            socket.to(room).emit('message',room, data);//发送给当前房间的其它客户端
    });

    socket.on('join', (room)=>{
            socket.join(room);
            var myRoom = io.sockets.adapter.rooms[room];
            var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
            logger.debug('the user number of room is: ' + users);

            if(users < USERCOUNT){
                    socket.emit('joined', room, socket.id); //发送给自己，相当于回调
               if(users > 1){
                  socket.to(room).emit('otherjoin', room, socket.id); //发送给当前房间的其它客户端
                    }

            }else{
                    socket.leave(room);
                    socket.emit('full', room, socket.id);
            }
    });
    socket.on('leave', (room)=>{
        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)? Object.keys(myRoom.sockets).length : 0;
        logger.debug('the user number of room is: ' + (users-1));
        socket.to(room).emit('bye', room, socket.id);
        socket.emit('leaved', room, socket.id);
});
});

https_server.listen(443, '0.0.0.0');
```

行安装和运行：

1. 安装 Node.js 和 npm：

2. 安装所需的依赖项

   ```shell
   npm install express socket.io fs http https
   ```

3. 启动 server

   ```shell
   node server.js
   ```

#### 1.2 搭建 sturn/turn 服务器

搭建 sturn/turn 服务器，以便提升 P2P 的成功率。

1. 安装 Coturn

   在终端中输入以下命令，安装 Coturn：

   ```shell
   apt-get install coturn
   systemctl stop coturn
   ```

2. 配置 Coturn[coTurn](https://github.com/coturn/coturn)

   找到并编辑 Coturn 的配置文件 `/etc/coturn/turnserver.conf`，根据您的需求修改以下配置项：

   ```shell
   # 配置监听的端口号
   listening-port=3478
   min-port=49152
   max-port=65535
   #配置域名
   realm=xxx.com
   #允许使用 TURN/STUN 服务的用户的凭据
   user=123456:123456
   cert=/path/to/xxx.pem
   pkey=/path/to/xxx.pem
   # 配置日志文件路径
   log-file=/root/log/turnserver.log
   ```

3. 启动 Coturn

   启动 Coturn 服务：

   ```shell
   sudo systemctl start coturn
   sudo systemctl stop coturn
   sudo systemctl restart coturn
   sudo systemctl status coturn
   ```

4. 测试 coturn

   我们可以去 [trickle-ice](https://link.juejin.cn/?target=https%3A%2F%2Fwebrtc.github.io%2Fsamples%2Fsrc%2Fcontent%2Fpeerconnection%2Ftrickle-ice%2F) 测试网站进行测试

   STUN 服务器，若能收集到一个类型为“srflx”的候选者，则工作正常。![[bs_stun服务器测试-不完全版.png](https://smms.app/image/r4CIMT7wujdHsOc)](https://s2.loli.net/2023/05/11/r4CIMT7wujdHsOc.png)

  TURN 服务器，若能收集到一个类型为“relay”的候选者，则工作正常。![bs_turn服务器测试-不完全版](https://s2.loli.net/2023/05/11/of1iBSINtWn8Ta3.png)

   由此上图 sturn 和 turn 候选者地址都能成功连接。

### 2. 客户端

在 **WebRTC** 中，双方通信通过 **ICE** 协议进行连接，通过 **SDP** 协议交换媒体信息，通过 **DTLS** 协议进行加密，通过 **SRTP** 协议进行媒体传输。

SDP

```
v=0
o=- 3409821183230872764 2 IN IP4 127.0.0.1
...
m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8 106 105 13 110 112 113 126
...
a=rtpmap:111 opus/48000/2
a=rtpmap:103 ISAC/16000
a=rtpmap:104 ISAC/32000
...
```

该 SDP 中描述了一路音频流，即  m=audio，该音频支持的 Payload ( 即数据负载 ) 类型包括 111、103、104 等等。在该 SDP 片段中又进一步对  111、103、104 等 Payload 类型做了更详细的描述，如 a=rtpmap:111 opus/48000/2 表示 Payload  类型为 111 的数据是 OPUS 编码的音频数据，采样率是 48000，使用双声道。以此类推， a=rtpmap:104 ISAC/32000 的含义是音频数据使用 ISAC 编码，采样频率是 32000，使用单声道。

#### 2.1. 获取媒体流

**WebRTC** 支持从设备摄像头和麦克风获取视频和音频流。使用 **JavaScript** 的`getUserMedia` API，请求用户授权，从摄像头和麦克风获取本地媒体流，并将其添加到一个`MediaStream`对象中。

```js
function startCall(){

	if(!navigator.mediaDevices ||
		!navigator.mediaDevices.getUserMedia){
		console.error('the getUserMedia is not supported!');
		return;
	}else {

		var constraints = {
			video: true, //传输视频
			audio: true  //传输音频
		}

		navigator.mediaDevices.getUserMedia(constraints)
					.then(getMediaStream)//打开成功的回调
					.catch(handleError);//打开失败
	}

}
```

#### 2.2 连接信令服务器并加入到房间中

```js
function connect(){
  //连接信令服务器
  socket = io.connect();
    //加入成功的通知
  	socket.on('joined', (roomid, id) => {
			...
	});
    //远端加入
  	socket.on('otherjoin', (roomid) => {
			...
	});
    //房间满了
  	socket.on('full', (roomid, id) => {
		...
	});
   //接收自己离开房间的回调
   socket.on('leaved', (roomid, id) => {
		...
	});
    //收到对方挂断的消息
   socket.on('bye', (room, id) => {
	 ...
	});
  //收到服务断开的消息
  socket.on('disconnect', (socket) => {
	...
	});
  //收消息，用于交换 SDP 和 ICE 消息等
  socket.on('message', (roomid, data) => {
  	...
	});
  //发送 join 消息到信令服务器并加入到 123456 房间中
  socket.emit('join', 123456);
}
```

#### 2.3 创建 PeerConnection 并添加媒体轨道

当收到自己加入房间成功的消息后，连接到远程等对方，创建一个`RTCPeerConnection`对象，并将本地媒体流添加到其中。然后创建一个`RTCDataChannel`对象，用于在对等方之间传输数据。

```js
var pcConfig = {
	// iceServers 其由RTCIceServer组成。每个RTCIceServer都是一个ICE代理的服务
	'iceServers': [{
	// urls 用于连接服务中的 url 数组
    'urls': 'turn:stun.lucp.top:3478',
	// credential 凭据， 只有 TURN 服务使用
    'credential': "mypasswd",
	// username 用户名，只有 TURN 服务使用
    'username': "lucp"
  }]
};
pc = new RTCPeerConnection(pcConfig);
		//当前 icecandida 数据
pc.onicecandidate = (e)=>{
      ...
}

    //datachannel 传输通道
pc.ondatachannel = e=> {
		...
}
// 添加远端的媒体流到 <video>  element
pc.ontrack = getRemoteStream;
  
//最后添加媒体轨道到 peerconnection 对象中
localStream.getTracks().forEach((track)=>{
		pc.addTrack(track, localStream);	
});
  
//创建一个非音视频的数据通道
dc = pc.createDataChannel('test');
dc.onmessage = receivemsg;//接收对端消息
dc.onopen = dataChannelStateChange;//当打开
dc.onclose = dataChannelStateChange;//当关闭
  
function getRemoteStream(e){
	remoteStream = e.streams[0];
	remoteVideo.srcObject = e.streams[0];
}
```

#### 2.4 发送 createOffer 数据到远端

当对方加入到房间中，需要把当前 UserA 的 SDP 信息告诉 UserB 用户

```js
var offerOptions = {//同时接收远端的音、视频数据
			offerToRecieveAudio: 1, 
			offerToRecieveVideo: 1
		}

		pc.createOffer(offerOptions)
			.then(getOffer)//创建成功的回调
			.catch(handleOfferError);

function getOffer(desc){
  //设置 UserA SDP 信息
	pc.setLocalDescription(desc);
	offerdesc = desc;

	//将 usera 的 SDP 发送到信令服务器，信令服务器再根据 roomid 进行转发
	sendMessage(roomid, offerdesc);	

}
```

#### 2.5 发送 answer 消息到对方

当 UserB 收到 UserA 发来的 offer 消息，我们需要设置 UserA 的 SDP 并且设置当前的 SDP 然后再讲自己的 SDP 发送给 UserA,以进行媒体协商：

```js
//1. 当收到 UserA OFFER 消息，设置 SDP
pc.setRemoteDescription(new RTCSessionDescription(data));

//2. 然后创建 answer 消息
pc.createAnswer()
.then(getAnswer)
.catch(handleAnswerError);

//3. 当创建成功后，拿到 UserB 自己的 SDP 消息并设置当前的 SDP 信息，最后再讲 SDP 消息发给信令再转发给 roomid 房间中的客户端
function getAnswer(desc){
	pc.setLocalDescription(desc);

	optBw.disabled = false;
	//send answer sdp
	sendMessage(roomid, desc);
}
```

#### 2.6 接收 answer 消息，并设置 UserB 的 SDP 信息

当我们收到 UserB 发来的 answer SDP 消息后告诉底层

```js
pc.setRemoteDescription(new RTCSessionDescription(data));
```

#### 2.7 交换 ICE 候选

SDP 协商完后，UserA / UserB 交换 ICE 消息，用于 NAT 和转发媒体数据

```js
//user A / UserB 收到 onicecandidate 回调然后将 candidate 发送给 UserB
pc.onicecandidate = (e)=>{
   if(e.candidate) {
				sendMessage(roomid, {
					type: 'candidate',
					label:event.candidate.sdpMLineIndex, 
					id:event.candidate.sdpMid, 
					candidate: event.candidate.candidate
				});
			}else{
				console.log('this is the end candidate');
			}
		}

//当 UserB / UserA 接收到 UserA / UserB 的candidate 后进行添加
function addIcecandida(data){

			var candidate = new RTCIceCandidate({
				sdpMLineIndex: data.label,
				candidate: data.candidate
			});
			pc.addIceCandidate(candidate)
				.then(()=>{
					console.log('Successed to add ice candidate');	
				})
				.catch(err=>{
					console.error(err);	
				});
}
```