//Non NodeJS requirements to set up on the RasPi:
//sudo apt install chromium-browser
//sudo apt install libwidevinecdm0
//Fake "screen/monitor" that gets set in /etc/rc.local (or ~/.bashrc?)

const fs = require('fs');
const app = require('express')();
const bodyparser = require("body-parser");
var https = require('https');
var server = https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  requestCert: false,
  rejectUnauthorized: false
},app);
//const https = require('https').Server(app);
const io = require('socket.io')(server);
const path = require('path');
const scdl = require('soundcloud-downloader').default;
const Cvlc = require('cvlc');
const homedir = require('os').homedir();
const SpotifyWebApi = require('spotify-web-api-node');
const puppeteer = require('puppeteer');

const port = 3000;
const client_id = require('./sc_client_id');
const spotify_client_id = require('./spotify_client_id');
const spotify_client_secret = require('./spotify_client_secret');
//const browser = puppeteer.launch({ headless: false, executablePath: '/usr/bin/chromium-browser', args: ["--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ['--mute-audio'] });
//const page = browser.newPage();
let page = puppeteer.page;
const browser = puppeteer.launch({ headless: false, executablePath: '/usr/bin/chromium-browser', args: ["--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ['--mute-audio'] })
  .then(browser => browser.newPage()
  .then(p => { page = p }) );

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: false }));

let player = new Cvlc(); //VLC process
let playerType = ""; //string for spotify/soundcloud/file
let player_isPlaying = false;
var current_song;
let spotify_token = "";
let spotify_device_id = "";
var spotifyApi = new SpotifyWebApi({  //Declare this out here then move init in to function, check if initialized when running?
  clientId: spotify_client_id,
  clientSecret: spotify_client_secret,
  redirectUri: 'https://bob.pi:3000/spotify/redirect'
});
let isSpotifyPlayerReady = false;
//Need to set the spotify token on a refresh when music is playing (clear it when music has been stopped for some time, or if no spotify songs are in the queue, etc)
//Set up to only do this if spotify stuff is set up in the settings
checkSpotifyRefreshToken(); 


app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/player.html'));
  });

function checkSpotifyRefreshToken() {
  if (fs.existsSync('spotify_refresh_token.txt')) {
    var ref_token = fs.readFileSync('spotify_refresh_token.txt');
    spotifyApi.setRefreshToken(ref_token);
    spotifyApi.refreshAccessToken().then(
      function(data) {
        console.log('Saved Spotify refresh token has been used to get a new access token');
        spotify_token = data.body['access_token'];
        spotifyApi.setAccessToken(spotify_token);
        return true;
      },
      function(err) {
        console.log('Could not refresh access token', err);
        return false;
      }
    );
  }
}

async function initSpotifyPlayer() {
  // Goto our local spotify player file, and send it the spotify auth token
  let myFile = __dirname + '/spotify_player.html';
  await page.goto('file://' + myFile, { waitUntil: 'networkidle0' });
  await page.evaluate((spotify_token) => document.getElementById("token_holder").auth_token = spotify_token, spotify_token);
  await page.addScriptTag({url: "https://sdk.scdn.co/spotify-player.js"});

  // Wait for the <p> element that holds the device ID to pop up, and when it does, grab the player's device_id from it
  selector = '#id_holder';
  await page.waitForSelector(selector);
  spotify_device_id = await page.evaluate((selector) => document.querySelector(selector).player_id, selector);
  console.log("Spotify player ready with ID: " + spotify_device_id);
  isSpotifyPlayerReady = true;
}

function sendCurrentlyPlayingInfo() {
  if (player_isPlaying == false) {
    io.emit('update_song_info', {type: "none"});
  }
  else {
    io.emit('update_song_info', {
      type: playerType,
      song: current_song
    });
  }
}

function stopCurrentStream(callback) {
  if (playerType == "spotify") {
    if (player_isPlaying == true) {
      spotifyApi.pause()
        .catch(err => console.log("Unable to pause Spotify (shouldn't be an issue, usually just means no song is currently playing on Spotify)"));
    }
  }

  player.cmd('is_playing', function gotResponse(err, response) { //Still have to check and stop the player if it's playing from another source
    if (err) {
      console.log(err);
    }
    //console.log(response);
    if (response.includes("1")) {
        player.cmd('stop', function gotResponse(err, response) {
            if (err) {
                console.log(err);
            }
            // JANKY WORKAROUND ALERT
            // Having an issue where VLC tries to keep reading the stream after stopping it
            // So for now, destroying the clv process and opening a new one each time the song is changed
            // I'll look in to this more to see if I can get something better working
            // If not, the queue will have to be kept separately from VLC
            player.destroy();
            console.log("previous stream stopped");
            player = new Cvlc();
            callback();
        });
    }
  });
}

app.get('/spotify/auth', function(req, res) {
  //var spotifyApi = new SpotifyWebApi({
  //  clientId: spotify_client_id,
  //  clientSecret: spotify_client_secret,
  //  redirectUri: 'https://bob.pi:3000/spotify/redirect'
  //});
  if (checkSpotifyRefreshToken() == true) {
    res.status(200).json({
      redirect: false
    });
  }
  else { //First time setting it up (will need to add a way to change the spotify user)
    var scopes = ['streaming', 'user-read-email', 'user-read-private', 'playlist-read-private', 'playlist-read-collaborative', 'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'user-library-read'];
    var state = "pi-state";
    var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    res.status(200).json({
      redirect: true,
      spotifyURL: authorizeURL
    });
  }
});

app.get('/songs/spotify/likes', function(req, res) {
  if (isSpotifyPlayerReady == false) {
    initSpotifyPlayer();
  }
  spotifyApi.getMySavedTracks({
    limit : 8,
    offset: 0
  })
  .then(function(data) {
    res.status(200).json({
      likes: data.body.items
    });
  }, function(err) {
    console.log('GET /songs/spotify/likes: Something went wrong!', err);
  });
});

app.get('/test4', function(req, res) {
  spotifyApi.getMe().then(function(data) {
    console.log(data.body);
  });
});

app.get('/spotify/redirect', function(req, res) {
    if (req.query.state == "pi-state") {
        // Retrieve an access token and a refresh token
        spotifyApi.authorizationCodeGrant(req.query.code).then(
            function(data) {
                console.log('The token expires in ' + data.body['expires_in']);
                console.log('The access token is ' + data.body['access_token']);
                console.log('The refresh token is ' + data.body['refresh_token']);

                //Need to redo how this works so that it checks for a saved access token (and refreshes it) in the /test function before making a url (player.html needs ability to handle that too)
                //fs.writeFile('spotifyaccess.token', data.body['access_token'], function (err) {
                //  console.log("ERROR: Unable to write Spotify access token to file: " + err);
                //});

                // Set the access token on the API object to use it in later calls
                spotify_token = data.body['access_token'];
                spotifyApi.setAccessToken(spotify_token);
                spotifyApi.setRefreshToken(data.body['refresh_token']);

                fs.writeFile('spotify_refresh_token.txt', data.body['refresh_token'], function() {console.log('Spotify refresh token saved'); });

                var spotify_user = spotifyApi.getMe().then(function(data) {
                  if (data.body.product != 'premium') {
                    //Might actually be able to just use the 
                    io.emit('popup_message', "Spotify account is not premium!\nUnfortunately you won't be able to use Spotify with PiMusicSrv.");
                  }
                })
            },
            function(err) {
                console.log('Something went wrong!', err);
            }
        );


    }
    
    res.sendFile(path.join(__dirname + '/spotify_autoclose.html'));
});

io.on('connection', (socket) => {
  console.log('user connected');
  socket.emit('update_song_info', {
    type: playerType,
    song: current_song
  });
  io.emit('connection_status', "PiMusicSrv connected");
  var sendProgressSeconds = setInterval(function() {
    if (playerType == "spotify" && player_isPlaying == true) {
        spotifyApi.getMyCurrentPlaybackState()
        .then(function(data) {
          if (data.body) {
            let seconds = parseInt(data.body.progress_ms) / 1000;
            io.emit('set_song_progress', seconds);
          }
        }, function(err) {
          console.log('/player/pause spotifyApigetMyCurrentPlaybackState: Something went wrong!', err);
      });
    }
    else if (player_isPlaying) {
      player.cmd('get_time', function gotResponse(error, response) {
        if (response.length != 1) {
          io.emit('set_song_progress', response);
        }
      });
    }
  }, 450); //update the client player's progress bar roughly twice a second
  socket.on('disconnect', () => {
    console.log('user disconnected');
    //if(io.of("/").sockets.size == 0) //Get the number of connected clients (# of devices/pages with the PiMusicSrv page open)
    clearInterval(sendProgressSeconds);
  });
  socket.on('seek', (seconds) => {
    if (playerType == "spotify") {
      console.log(seconds);
      page.evaluate((seconds) => player.seek(seconds * 1000).then(() => { return "Spotify playback seeked to " + seconds}), seconds).then(message => console.log(message));
    }
    else {
      player.cmd('seek ' + seconds, function gotResponse(error, response) {
        if (error) {
          console.error(`exec error: ${error}`);
        }
        console.log("seeked to: " + seconds);
      });
    }
  });
});

app.get("/songs/soundcloud/likes", (req, res) => {
    var numTracks = 10
    scdl.getLikes({ profileURL: "https://soundcloud.com/saltinecrackas" }, numTracks, 0)
        .then(info => {
        //console.log(info);
        //for (var i = 0; i < numTracks; i++) {
        //    console.log(info.collection[i].track);
        //}
            res.status(200).json({
                likes: info.collection
        });
        //.catch(err => console.log(err));
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
  player_isPlaying = !player_isPlaying;

  if (playerType == "spotify") {
    page.evaluate(() => player.togglePlay().then(() => { return "Spotify playback toggled"}) ).then(message => console.log(message));
  }
  else {
    player.cmd('pause', function gotResponse(err, response) {
	    console.log(response);
      console.log('paused');
    });
  }

  res.status(200).json({
    message: "Player paused"
  });
});

/*app.get("/player/current/info", (req, res) => { //REPLACED BY SOCKET.IO FUNCTION
  if (player_isPlaying == false) {
    res.status(200).json({
      type: "none"
    });
  }
  else {
    res.status(200).json({
      type: playerType,
      song: current_song
    });
  }
});*/

/*app.get("/player/current/seconds", (req, res) => { //REPLACED BY SOCKET.IO FUNCTION
    player.cmd('get_time', function gotResponse(err, response) {
        console.log(response)
        res.status(200).json({
            seconds: response
        });
    });
});*/

app.post('/player/play/spotify', function(req, res) {
  stopCurrentStream(() => {
    if (isSpotifyPlayerReady == false) {
      console.log("Spotify player isn't ready yet, try starting the song again in a few seconds"); //In the future set this up to just wait for the player to be ready (assuming it's being set up and there wasn't an error)
    }
    else {
      playerType = "spotify";
      player_isPlaying = true;
      current_song = req.body.spotify_song;
      const link = current_song.uri;

      console.log("Starting Spotify stream with link: " + link);
      spotifyApi.play({device_id: spotify_device_id, uris: [link]});
      sendCurrentlyPlayingInfo()

      res.status(200).json({
        type: playerType,
        song: current_song
      });
    }
  });
});

app.post("/player/play/file", (req, res) => {
  stopCurrentStream(() => {
    playerType = "file";
    player_isPlaying = true;
    const file_name = req.body.file_name;
    const file_path = path.join(homedir, "/Music", file_name);
    console.log('Playing from file: ' + file_path);
    current_song = {
      name: file_name,
      path: file_path
    };

    player.play(file_path, function startedStream() {
      console.log("playing from: " + file_path);
      sendCurrentlyPlayingInfo()
      res.status(200).json({
        type: playerType,
        song: current_song
      });
    });
  });
});

app.post("/player/play/soundcloud", (req, res) => {
  stopCurrentStream(() => {
    playerType = "soundcloud";
    player_isPlaying = true;
    current_song = req.body.soundcloud_song;
    const link = current_song.permalink_url;

    if (link.includes("https://soundcloud.com/")) {
      current_link = link;
      scdl.download(link).then(stream => {
        player.play(stream, function startedStream() {
          console.log("playing from: " + link);
          sendCurrentlyPlayingInfo()
        });
      });

      res.status(200).json({
        type: playerType,
        song: current_song
      });
    }
  });
});


server.listen(port, () => {
    console.log(`running on port: ${port}`);
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
  io.emit('connection_status', "PIMUSICSRV DISCONNECTED");
  process.exit(1);
});
