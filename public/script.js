var socket, canvas, ctx, user;
var keys = {};
var p1, p2, ball;
var tab = 'home';
var kd = false, cl = false, md = false, down = false;

window.addEventListener('load', function() {
	socket = io.connect();
	setSocketEvents();

	canvas = document.getElementById('canvas');
	ctx = canvas.getContext('2d');

	window.addEventListener('resize', resize);
	window.addEventListener('keydown', keydown);
	window.addEventListener('keyup', keyup);
	window.addEventListener('mousedown', function(e) {
		down = true;
		touching(e);
	});
	window.addEventListener('mousemove', touching);
	window.addEventListener('mouseup', function(e) {
		down = false;
		touching(e);
	});
	window.addEventListener('touchstart', touching);
	window.addEventListener('touchmove', touching);
	window.addEventListener('touchend', endtouch);
	window.addEventListener('touchcancel', endtouch);
	resize();

	if(isMobileDevice()) {
		md = true;
		document.getElementById('message').children[1].textContent = 'Tap Anywhere to Continue';
	}
});

function resize() {
	//resize	
}
function keydown(e) {
	if(!kd && tab === 'message') {cl = true;}
	kd = true;
	keys[e.keyCode] = true;
	keys.shift = e.shiftKey,keys.meta = e.metaKey,keys.ctrl = e.ctrlKey,keys.alt = e.altKey;
	hotkeys();
}
function keyup(e) {
	kd = false;
	if(cl) {tabTo('home');cl = false;}
	delete keys[e.keyCode];
	keys.shift = e.shiftKey,keys.meta = e.metaKey,keys.ctrl = e.ctrlKey,keys.alt = e.altKey;
	hotkeys();
}
function touching(e) {
	var box = document.getElementById('canvas').getBoundingClientRect();
	if(e.changedTouches) {
		var ty = e.changedTouches[0].clientY - box.top;
	}
	else if(down) {
		var ty = e.clientY - box.top;
	}
	if(ty && user && user.game && user.game.status === 'playing') {
		if(ty > canvas.height/2) {
			user.paddle.dir = 1;
		}
		else {
			user.paddle.dir = -1;
		}
	}
}
function endtouch(e) {
	if(user && user.paddle) {
		user.paddle.dir = 0;
	}
}
function hotkeys() {
	if(user && user.game && user.game.status === 'playing') {
		if(keys[87] || keys[38]) {
			user.paddle.dir = -1;
		}
		else if(keys[83] || keys[40]) {
			user.paddle.dir = 1;
		}
		else {
			user.paddle.dir = 0;
		}
	}
}

function tabTo(t) {
	if(typeof t === 'string') {t = document.getElementById(t);}
	tab = t.id;
	var tabs = document.getElementsByClassName('content');
	for(var i = 0;i<tabs.length;i++) {
		tabs[i].style.display = 'none';
	}
	t.style.display = 'block';
	if(t.id === 'wait' || t.id === 'host' || t.id === 'join') {
		document.getElementById('homeBtn').style.display = 'block';
	}
	else {
		document.getElementById('homeBtn').style.display = 'none';
	}
	if(t.id === 'game' && md) {
		document.getElementById('metaMobile').setAttribute('content', 'width=device-width, initial-scale=.7, maximum-scale=.5, user-scalable=0');
		document.body.scrollTop = document.body.scrollHeight/2 - t.children[0].offsetHeight/2;
		document.body.scrollLeft = document.body.scrollWidth/2 - t.children[0].offsetWidth/2;
	}
	else {
		document.getElementById('metaMobile').setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');
	}
}
function goHome() {
	if(user.game) {
		user.leaveGame();
	}
	tabTo('home');
}
function draw() {
	if(user.game && (user.game.status === 'playing' || user.game.status === 'readying')) {
		ctx.clearRect(0,0,canvas.width,canvas.height);
		user.paddle.y += user.paddle.dir*user.paddle.spd;
		socket.emit('paddle', user.paddle);
		socket.emit('ball');
		drawBall(user.game.ball);
		drawPaddle(user.game.p1);
		drawPaddle(user.game.p2);
	}
	window.requestAnimationFrame(draw);
}
function waitMsg(msg) {
	var w = document.getElementById('wait')
	w.children[0].textContent = msg;
	tabTo('wait');
}
function setSocketEvents() {
	socket.on('load', function(data) {
		user = new User(data.id);
		canvas.width = data.w;
		canvas.height = data.h;
		document.getElementById('preload').style.opacity = "0";
		setTimeout(function() {document.getElementById('preload').style.zIndex = -10;},500);
		draw();
	});
	socket.on('err', function(err) {
		notification('Error', err, true);
	});
	socket.on('gameUpdate', function(g) {
		user.game = Object.assign({},g);
		if(user.id === user.game.p1.id) {user.paddle = user.game.p1;}
		else {user.paddle = user.game.p2;}
	});
	socket.on('paddle', function(p) {
		user.game[p.player] = Object.assign(user.game[p.player],p);
	});
	socket.on('ball', function(b) {
		user.game.ball = b;
	});
	socket.on('hit', function() {
		playSound('hit.wav');
	})
	socket.on('end', function(id) {
		var msg = user.id === id ? 'You Win' : 'You Lose';
		user.leaveGame(msg);
	});
	socket.on('failhost', function(msg) {
		tabTo('host');
		notification('Error', msg, true);
	});
	socket.on('failjoin', function(msg) {
		tabTo('join');
		notification('Error', msg, true);
	});
	socket.on('disconnection', function() {
		notification('Opponent Disconected', 'Your opponent has left the game');
		user.leaveGame('You Win');
	});
	socket.on('clientTrigger', function(t) {
		if(t === 'gameready') {
			user.startGame();
		}
		if(t === 'readyuped') {
			var cd = document.getElementById('countdown');
			cd.style.display = 'block';
			cd.textContent = 'GO';
			setTimeout(function() {
				cd.style.display = 'none';
			},1000);
		}
	});
}


class User {
	constructor(id) {
		this.id = id;
		this.paddle = null;
		this.game = null;
	}
	findGame() {
		socket.emit('findGame', this.id);
		waitMsg('Matchmaking');
	}
	startGame() {
		tabTo('game');
		var self = this;
		countdown(3,function() {
			self.readyUp();
		});
	}
	readyUp() {
		if(this.game.status === 'readying') {
			socket.emit('readyup', {p:this.paddle.player});
		}
	}
	leaveGame(msg) {
		socket.emit('leaveGame');
		this.game = null;
		message(msg);
	}
	host() {
		var code = document.getElementById('hostID').value;
		socket.emit('host', encodeURIComponent(code));
		waitMsg('Waiting for Opponent');
		document.getElementById('hostID').value = "";
	}
	join() {
		var code = document.getElementById('joinID').value;
		socket.emit('join', encodeURIComponent(code));
		waitMsg('Joining');
		document.getElementById('joinID').value = "";
	}
}


function drawPaddle(p) {
	if(p.y-p.h/2 < 0) {
		p.y = p.h/2;
	}
	else if(p.y+p.h/2 > canvas.height) {
		p.y = canvas.height - p.h/2;
	}

	ctx.fillStyle = p.id === user.id ? "#afd456" : "#a7a7a7";
	ctx.fillRect(p.x-p.w/2,p.y-p.h/2,p.w,p.h);
}
function drawBall(b) {
	ctx.fillStyle = b.color;
	ctx.beginPath();
	ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
	ctx.fill();
}





//Helpers

var notifTimer, notifs = {};
function notification(title,content,error) {
  if(document.getElementById("notification").offsetLeft < document.body.offsetWidth) {
    notifs[Object.keys(notifs).length] = [title,content,error];
    return;
  }
  document.getElementById("notification").innerHTML = "<h3>"+title+"</h3><p>"+content+"</p>";
  if(error) {document.getElementById("notification").style.borderColor = "#f60403";}
  else {document.getElementById("notification").style.borderColor = "#68C249";}
  document.getElementById("notification").style.left = "calc(100% - " + document.getElementById("notification").offsetWidth + "px)";
  notifTimer = setTimeout(function() {
    deleteNotification();
  }, 8000);
}

function deleteNotification() {
  document.getElementById("notification").style.left = "calc(100% + 6px)";
  clearTimeout(notifTimer);
  if(Object.keys(notifs).length > 0) {
    var next = notifs[Object.keys(notifs)[0]];
    notification(next[0],next[1],next[2]);
    delete notifs[Object.keys(notifs)[0]];
  }
}

function countdown(sec,callback) {
	var cd = document.getElementById('countdown');
	cd.style.display = 'block';
	cd.textContent = sec;
	var int = setInterval(function() {
		sec --;
		if(sec === 0) {
			clearInterval(int);
			if(callback) {callback();}
			cd.style.display = 'none';
			return;
		}
		cd.textContent = sec;
	}, 1000);
}
function message(msg) {
	document.getElementById('message').children[0].textContent = msg;
	tabTo('message');
}


function playSound(snd) {
	var a = new Audio();
	a.src = snd;
	a.className = 'hidden';
	a.autoplay = true;
	a.volume = .1;
	a.onended = function() {
		document.body.removeChild(this);
	}
	document.body.appendChild(a);
}

function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
};