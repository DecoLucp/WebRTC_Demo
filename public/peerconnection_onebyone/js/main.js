/*
 *Author: Lucp
 *Date: 2023-04-16 20:54:25
 *LastEditors: Lucp
 *LastEditTime: 2023-05-11 10:07:47
 *FilePath: \webserver\public\peerconnection_onebyone\js\main.js
 *Contact me--email: lucp@88.com
 */

'use strict'

var localVideo = document.querySelector('video#localvideo');
var remoteVideo = document.querySelector('video#remotevideo');

var btnConn =  document.querySelector('button#connserver');
var btnLeave = document.querySelector('button#leave');

var offer = document.querySelector('textarea#offer');
var answer = document.querySelector('textarea#answer');

var shareDeskBox  = document.querySelector('input#shareDesk');

var pcConfig = {
	// iceServers 其由RTCIceServer组成。每个RTCIceServer都是一个ICE代理的服务
	'iceServers': [{
	// urls 用于连接服务中的 url数组
    'urls': 'turn:stun.lucp.top:3478',
	// credential 凭据， 只有 TURN服务使用
    'credential': "mypasswd",
	// username 用户名，只有 TURN服务使用
    'username': "lucp"
	}]
};

var localStream = null;
var remoteStream = null;

var pc = null;

var roomid;
var socket = null;

var offerdesc = null;
var state = 'init';

// 以下代码是从网上找的
//=========================================================================================

//如果返回的是false说明当前操作系统是手机端，如果返回的是true则说明当前的操作系统是电脑端
function IsPC() {
	var userAgentInfo = navigator.userAgent;
	var Agents = ["Android", "iPhone","SymbianOS", "Windows Phone","iPad", "iPod"];
	var flag = true;

	for (var v = 0; v < Agents.length; v++) {
		if (userAgentInfo.indexOf(Agents[v]) > 0) {
			flag = false;
			break;
		}
	}

	return flag;
}

//如果返回true 则说明是Android  false是ios
function is_android() {
	var u = navigator.userAgent, app = navigator.appVersion;
	var isAndroid = u.indexOf('Android') > -1 || u.indexOf('Linux') > -1; //g
	var isIOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/); //ios终端
	if (isAndroid) {
		//这个是安卓操作系统
		return true;
	}

	if (isIOS) {
		//这个是ios操作系统
		return false;
	}
}

//获取url参数
function getQueryVariable(variable)
{
	var query = window.location.search.substring(1);
	var vars = query.split("&");
	for (var i=0;i<vars.length;i++) {
			var pair = vars[i].split("=");
			if(pair[0] == variable){return pair[1];}
	}
	return(false);
}

//=======================================================================

function sendMessage(roomid, data){

	console.log('send message to other end', roomid, data);
	if(!socket){
		console.log('socket is null');
	}
	socket.emit('message', roomid, data);
}

function conn(){
	//连接信令服务器
	socket = io.connect();
	//加入成功的通知
	socket.on('joined', (roomid, id) => {
		console.log('receive joined message!', roomid, id);
		state = 'joined'

		//如果是多人的话，第一个人不该在这里创建peerConnection
		//都等到收到一个otherjoin时再创建
		//所以，在这个消息里应该带当前房间的用户数
		//
		//create conn and bind media track
		createPeerConnection();
		bindTracks();

		btnConn.disabled = true;
		btnLeave.disabled = false;
		console.log('receive joined message, state=', state);
	});

	//远端加入
	socket.on('otherjoin', (roomid) => {
		console.log('receive joined message:', roomid, state);

		//如果是多人的话，每上来一个人都要创建一个新的 peerConnection
		if(state === 'joined_unbind'){
			createPeerConnection();
			bindTracks();
		}

		state = 'joined_conn';
		call();

		console.log('receive other_join message, state=', state);
	});

	//房间满了
	socket.on('full', (roomid, id) => {
		console.log('receive full message', roomid, id);
		hangup();
		closeLocalMedia();
		state = 'leaved';
		console.log('receive full message, state=', state);
		alert('the room is full!');
	});

	//接收自己离开房间的回调
	socket.on('leaved', (roomid, id) => {
		console.log('receive leaved message', roomid, id);
		state='leaved'
		socket.disconnect();
		console.log('receive leaved message, state=', state);

		btnConn.disabled = false;
		btnLeave.disabled = true;
	});

	//收到对方挂断的消息
	socket.on('bye', (room, id) => {
		console.log('receive bye message', roomid, id);
		//state = 'created';
		//当是多人通话时，应该带上当前房间的用户数
		//如果当前房间用户不小于 2, 则不用修改状态
		//并且，关闭的应该是对应用户的peerconnection
		//在客户端应该维护一张peerconnection表，它是
		//一个key:value的格式，key=userid, value=peerconnection
		state = 'joined_unbind';
		hangup();
		offer.value = '';
		answer.value = '';
		console.log('receive bye message, state=', state);
	});

	//收到服务断开的消息
	socket.on('disconnect', (socket) => {
		console.log('receive disconnect message!', roomid);
		if(!(state === 'leaved')){
			hangup();
			closeLocalMedia();

		}
		state = 'leaved';
	});

	//收消息，用于交换 SDP 和 ICE 消息等
	socket.on('message', (roomid, data) => {
		console.log('receive message!', roomid, data);

		if(data === null || data === undefined){
			console.error('the message is invalid!');
			return;
		}

		if(data.hasOwnProperty('type') && data.type === 'offer') {
			offer.value = data.sdp;
			// 1.当收到 UserA OFFER 消息，设置 SDP
			pc.setRemoteDescription(new RTCSessionDescription(data));
			// 2.创建 answer 消息
			pc.createAnswer()
				.then(getAnswer)
				.catch(handleAnswerError);
		}else if(data.hasOwnProperty('type') && data.type == 'answer'){
			answer.value = data.sdp;
			// 接收 answer 消息，并设置 UserB 的 SDP 信息
			pc.setRemoteDescription(new RTCSessionDescription(data));
		}else if (data.hasOwnProperty('type') && data.type === 'candidate'){
			var candidate = new RTCIceCandidate({
				// sdpMLineIndex 在 SDP 中 m= 的索引值
				sdpMLineIndex: data.label,
				// candidate 候选者描述信息
				candidate: data.candidate
			});
			pc.addIceCandidate(candidate);
		}else{
			console.log('the message is invalid!', data);
		}
	});


	roomid = getQueryVariable('room');
	//发送 join 消息到信令服务器并加入到 xx 房间中
	socket.emit('join', roomid);

	return true;
}

function connSignalServer(){
	//开启本地视频
	start();

	return true;
}

function getMediaStream(stream){

	if(localStream){
		stream.getAudioTracks().forEach((track)=>{
			localStream.addTrack(track);
			stream.removeTrack(track);
		});
	}else{
		localStream = stream;
	}

	localVideo.srcObject = localStream;

	//这个函数的位置特别重要，
	//一定要放到getMediaStream之后再调用
	//否则就会出现绑定失败的情况
	//
	//setup connection
	conn();

	//btnStart.disabled = true;
	//btnCall.disabled = true;
	//btnHangup.disabled = true;
}

function getDeskStream(stream){
	localStream = stream;
}

function handleError(err){
	console.error('Failed to get Media Stream!', err);
}

function shareDesk(){

	if(IsPC()){
		navigator.mediaDevices.getDisplayMedia({video: true})
			.then(getDeskStream)
			.catch(handleError);

		return true;
	}

	return false;

}

// 获取媒体流
function start(){

	if(!navigator.mediaDevices ||
		!navigator.mediaDevices.getUserMedia){
		console.error('the getUserMedia is not supported!');
		return;
	}else {

		var constraints;
		// 共享桌面
		if( shareDeskBox.checked && shareDesk()){

			constraints = {
				video: false,
				audio:  {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}

		}else{
			constraints = {
				video: true,
				audio:  {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}
		}

		navigator.mediaDevices.getUserMedia(constraints)
					.then(getMediaStream)//打开成功的回调
					.catch(handleError);//打开失败
	}

}

function getRemoteStream(e){
	remoteStream = e.streams[0];
	remoteVideo.srcObject = e.streams[0];
}

function handleOfferError(err){
	console.error('Failed to create offer:', err);
}

function handleAnswerError(err){
	console.error('Failed to create answer:', err);
}

// 3.当创建成功后，拿到 UserB 自己的 SDP 消息并设置当前的 SDP 信息，最后再讲 SDP 消息发给信令再转发给 roomid 房间中的客户端
function getAnswer(desc){
	pc.setLocalDescription(desc);
	answer.value = desc.sdp;

	//send answer sdp
	sendMessage(roomid, desc);
}

function getOffer(desc){
	// 设置 UserA SDP 信息
	pc.setLocalDescription(desc);
	offer.value = desc.sdp;
	offerdesc = desc;

	// 将 UserA 的 SDP 发送到信令服务器，信令服务器再根据 roomid 进行转发
	sendMessage(roomid, offerdesc);

}

function createPeerConnection(){
	//如果是多人的话，在这里要创建一个新的连接.
	//新创建好的要放到一个map表中。
	//key=userid, value=peerconnection
	console.log('create RTCPeerConnection!');
	if(!pc){
		pc = new RTCPeerConnection(pcConfig);
		// 当前 icecandida 数据
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
		// 添加远端的媒体流到 <video> element
		pc.ontrack = getRemoteStream;
	}else {
		console.warning('the pc have be created!');
	}

	return;
}

//绑定永远与 peerconnection在一起，所以没必要再单独做成一个函数
function bindTracks(){

	console.log('bind tracks into RTCPeerConnection!');

	if( pc === null || pc === undefined) {
		console.error('pc is null or undefined!');
		return;
	}

	if(localStream === null || localStream === undefined) {
		console.error('localstream is null or undefined!');
		return;
	}

	// 添加媒体轨道到 peerconnection 对象中
	localStream.getTracks().forEach((track)=>{
		pc.addTrack(track, localStream);
	});

}

function call(){
	if(state === 'joined_conn'){
		// 同时接收远端的音、视频数据
		var offerOptions = {
			offerToRecieveAudio: 1,
			offerToRecieveVideo: 1
		}

		pc.createOffer(offerOptions)
			.then(getOffer)// 创建成功的回调
			.catch(handleOfferError);
	}
}

function hangup(){

	if(pc) {

		offerdesc = null;
		pc.close();
		pc = null;
	}

}

function closeLocalMedia(){

	if(localStream && localStream.getTracks()){
		localStream.getTracks().forEach((track)=>{
			track.stop();
		});
	}
	localStream = null;
}

function leave() {

	if(socket){
		socket.emit('leave', roomid); //notify server
	}

	hangup();
	closeLocalMedia();

	offer.value = '';
	answer.value = '';
	btnConn.disabled = false;
	btnLeave.disabled = true;
}

btnConn.onclick = connSignalServer
btnLeave.onclick = leave;
