const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const bodyparser = require("body-parser");
const path = require('path');
const scdl = require('soundcloud-downloader').default;
const fs = require('fs');
const Cvlc = require('cvlc');
const homedir = require('os').homedir();

const hostname = '192.168.45.35';
const port = 3000;
const client_id = 'INSERT_YOUR_SC_CLIENT_ID_HERE';
const player = new Cvlc();
let current_link = "";

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: false }));

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/sc.html'));
  });


io.on('connection', (socket) => {
  console.log('user connected');
  io.emit('connection_status', "Server connected");
  var sendProgressSeconds = setInterval(function() {
    player.cmd('get_time', function gotResponse(error, response) {
      if (response.length != 1) {
        io.emit('set_song_progress', response);
      }
    });
  }, 450); //update the client player's progress bar twice a second (doing 1 second, sometimes it skips a number)
  socket.on('disconnect', () => {
    console.log('user disconnected');
    clearInterval(sendProgressSeconds);
  });
  socket.on('seek', (seconds) => {
    player.cmd('seek ' + seconds, function gotResponse(error, response) {
      if (error) {
        console.error(`exec error: ${error}`);
      }
      console.log("seeked to: " + seconds);
    });
  });
});

app.get("/songs/files", (req, res) => {
  fs.readdir(path.join(homedir, "/Music"), (err, files) => {
    if(err) {
      console.log(err);
    }
    console.log(files);
    res.status(200).json({
       local_files: files
    });

  });
});

app.get("/player/pause", (req, res) => {
    player.cmd('pause', function gotResponse(err, response) {
	console.log(response);
        console.log('paused');
    });

   res.status(200).json({
       message: "Player paused"
   });
});

app.get("/player/current/info", (req, res) => {
    scdl.getInfo(current_link).then(info => {
        res.status(200).json(info);
    });
});

app.get("/player/current/seconds", (req, res) => {
    player.cmd('get_time', function gotResponse(err, response) {
        console.log(response)
        res.status(200).json({
            seconds: response
        });
    });
});

app.post("/player/play/file", (req, res) => {
    console.log(req.body);
    const file_name = req.body.file_name;
    console.log(file_name);
    const file_path = path.join(homedir, "/Music", file_name);
    console.log(file_path);

    player.cmd('is_playing', function gotResponse(err, response) {
        if (err) {
          console.log(err);
        }
        console.log(response);
        if (response.includes("1")) {
            player.cmd('stop', function gotResponse(err, response) {
                if (err) {
                    console.log(err);
                }
                console.log("previous stream stopped");
            });
        }
    });

    player.play(file_path, function startedStream() {
        console.log("playing from: " + file_path);
        scdl.getInfo(current_link).then(info => {
            res.status(200).json({
                type: "local_file",
                file_name: file_name,
                file_path: file_path
            });
        });
    });
});

app.post("/listen/link", (req, res) => {
    const link = req.body.sc_link;

    if (link.includes("https://soundcloud.com/")) {
        current_link = link;
        //scdl.getInfo(link).then(info => { console.log(info); });
        scdl.download(link).then(stream => { //stream.pipe(Speaker));//stream.pipe(fs.createWriteStream('song.mp3')))
            player.play(stream, function startedStream() {
                console.log("playing from: " + link);
            });
        });

        res.sendFile(path.join(__dirname + '/player.html'));
    }
});

http.listen(port, () => {
    console.log(`running at port ${port}`);
  });

process.on('SIGINT', function() {
  console.log( "\nShutting down from SIGINT (Ctrl-C)" );
  // some other closing procedures go here
  player.cmd('quit', function gotResponse(err, response) {
    if (err) {
      console.log(err);
    }
    console.log(response);
  });
  player.destroy();
  io.emit('connection_status', "SERVER DISCONNECTED");
  process.exit(1);
});
