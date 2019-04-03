const port = process.argv[2] || 9000;
const uuid = require('uuid');
const express = require('express');
const favicon = require('serve-favicon');
const app = express();

app.use(express.static(__dirname+'/public'));
app.use(favicon(__dirname+'/public/favicon.ico'));

const server = require('http').createServer(app);
server.listen(port, function() {
	console.log('Listening on Port ' + port);
});


let online = 0;
let games = {};
let hosted = {};
let users = {};
var h = w = 550;



const io = require('socket.io')(server);
io.on('connection', function (socket) {
	let id = socket.id;
	new User(id);
	socket.emit('load', {id,h,w});
	online ++;


	socket.on('findGame', function(id) {
		if(id in users) {
			findOpenGame(users[id],socket);
		}
		else {
			socket.emit('err', 'User not created on server');
		}
	});
	socket.on('host', function(code) {
		if(code in hosted) {
			socket.emit('failhost', 'This game code is already in use.')
		}
		else {
			var g = new Game();
			g.hosted = true;
			g.code = code;
			g.addPlayer(users[socket.id],socket);
			hosted[code] = g;
		}
	});
	socket.on('join', function(code) {
		if(hosted[code]) {
			hosted[code].addPlayer(users[socket.id],socket);
			delete hosted[code];
		}
		else {
			socket.emit('failjoin', 'No game with that game code exists')
		}
	});
	socket.on('paddle', function(p) {
		if(!games[users[socket.id].game]) {return;}
		var paddle = games[users[socket.id].game][p.player];
		paddle.y = p.y;
		paddle.dir = p.dir;
		socket.broadcast.to(p.game).emit('paddle', paddle);
	});
	socket.on('readyup', function(data) {
		if(!games[users[socket.id].game]) {return;}
		games[users[socket.id].game].readyUp(data.p);
	});
	socket.on('ball', function() {
		if(!games[users[socket.id].game]) {return;}
		games[users[socket.id].game].sendBall(socket);
	});
	socket.on('leaveGame', function() {
		if(!games[users[socket.id].game]) {return;}
		games[users[socket.id].game].leaveGame(socket);
	});
	socket.on('disconnect', function() {
		if(games[users[socket.id].game]) {
			games[users[socket.id].game].disconnect(socket);
		}
	});
});

function findOpenGame(user,socket) {
	var g = false;
	var gms = Object.keys(games);
	for(var i = 0;i<gms.length;i++) {
		var id = gms[i];
		if(!(games[id].isFull()) && games[id].status === 'matchmaking' && !games.hosted) {g = games[id];break;};
	}
	if(!g) {g = new Game();}
	g.addPlayer(user,socket);
}

class Game {
	constructor() {
		this.id = uuid();
		this.p1 = new Paddle(this.id,30,h/2,10,100,"p1");
		this.p2 = new Paddle(this.id,w-30,h/2,10,100,"p2");
		this.ball = new Ball(this.id,w/2,h/2,6);
		this.status = 'matchmaking';
		this.hosted = false;
		games[this.id] = this;
		var self = this;
		this.interval = setInterval(function() {
			if(self.status === 'playing' && self.isFull()) {
				self.ball.update();
			}
		});
	}
	isFull() {
		if(this.p1.id && this.p2.id) {
			return true;
		}
		return false;
	}
	addPlayer(player,socket) {
		if(!this.p1.id) {this.p1.id = player.id;}
		else if(!this.p2.id) {this.p2.id = player.id;}
		else {socket.emit('err', 'Failed to join game');return;}
		socket.join(this.id);
		player.game = this.id;
		this.updateClients();
		if(this.isFull()) {
			this.status = 'readying';
			this.clientTrigger('gameready');
			this.updateClients();
		}
	}
	updateClients() {
		if(!this.isFull() && this.status !== 'matchmaking') {this.status = 'disconnected';}
		var game = Object.assign({}, this);
		game.interval = "";
		io.to(this.id).emit('gameUpdate', game);
	}
	clientTrigger(t) {
		io.in(this.id).emit('clientTrigger', t);
	}
	readyUp(player) {
		this[player].ready = true;
		if(this.p1.ready && this.p2.ready) {
			this.status = 'playing';
			this.ball.vel.set(3,2);
			this.updateClients();
			this.clientTrigger('readyuped');
		}
	}
	sendBall(socket) {
		if(this.status === 'playing' || this.status === 'readying') {
			socket.emit('ball', this.ball);
		}
	}
	disconnect(socket) {
		this.leaveGame(socket);
		io.in(this.id).emit('disconnection');
	}
	end(winner) {
		io.in(this.id).emit('end', this[winner].id);
	}
	leaveGame(socket) {
		socket.leave(this.id);
		if(this.p1.id === socket.id) {this.p1.id = false;}
		else if(this.p2.id === socket.id) {this.p2.id = false;}
		this.updateClients();
		if(!this.p1.id && !this.p2.id) {
			delete games[this.id];
			if(this.code && this.code in hosted) {
				delete hosted[this.code];
			}
		}
	}
}
class User {
	constructor(id) {
		this.id = id;
		this.game = null;
		this.wins = 0;
		this.losses = 0;
		users[id] = this;
	}
}
class Paddle {
	constructor(game,x,y,w,h,player) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.dir = 0;
		this.spd = 4;
		this.color = '#FFCC66';
		this.game = game;
		this.player = player;
	}
}

class Ball {
	constructor(game,x,y,r) {
		this.x = x;
		this.y = y;
		this.r = r;
		this.spd = .3;
		this.vel = new Vector();
		this.color = '#fefefe';
		this.game = game;
		this.hitsTaken = 0;
	}
	update() {
		this.hitsPaddle(games[this.game].p1);
		this.hitsPaddle(games[this.game].p2);
		if(this.y <= this.r || this.y >= h-this.r) {
			this.vel.y *= -1;
			io.in(this.game).emit('hit');
		}
		if(this.x < -this.r) {
			games[this.game].end('p2');
			users[games[this.game].p1.id].losses ++;
			users[games[this.game].p2.id].wins ++;
		}
		if(this.x > w+this.r) {
			games[this.game].end('p1');
			users[games[this.game].p1.id].wins ++;
			users[games[this.game].p2.id].losses ++;
		}
		this.vel.setMag(this.spd);
		this.x += this.vel.x;
		this.y += this.vel.y;
	}
	hitsPaddle(paddle) {
		var px = paddle.x - paddle.w/2,
				py = paddle.y - paddle.h/2;
		var dx = this.x - Math.max(px, Math.min(this.x, px + paddle.w)),
				dy = this.y - Math.max(py, Math.min(this.y, py + paddle.h));
		if((dx * dx + dy * dy) < (this.r * this.r)) {
			io.in(this.game).emit('hit');
			this.vel.x *= -1;
			if(paddle.dir > 0) {
				this.vel.y += this.spd/2;
			}
			else if(paddle.dir < 0) {
				this.vel.y -= this.spd/2;
			}
			this.x = paddle.player === 'p1' ? paddle.x + paddle.w/2 + this.r : px - this.r;
			this.hitsTaken ++;
			if(this.hitsTaken % 5) {
				this.spd *= 1.05;
				games[this.game].p1.spd *= 1.05;
				games[this.game].p2.spd *= 1.05;
			}
		}
	}
}
class Vector {
	constructor(x,y) {
		this.x = x || 0;
		this.y = y || 0;
	}
	set(x,y) {
		this.x = x;
		this.y = y;
		return this;
	}
	mult(f) {
		this.x *= f, this.y *= f;
		return this;
	}
	div(f) {
		this.x /= f, this.y /= f;
		return this;
	}
	mag() {
		return Math.sqrt(this.x*this.x + this.y*this.y);
	}
	setMag(m) {
		this.div(this.mag());
		this.mult(m);
		return this;
	}
}