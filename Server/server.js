//Non NodeJS requirements to set up on the RasPi:
//sudo apt install chromium-browser
//sudo apt install libwidevinecdm0
//Fake "screen/monitor" that gets set in /etc/rc.local (or ~/.bashrc?)

const fs = require('fs');
const express = require('express');
const app = express();
const bodyparser = require("body-parser");
const https = require('https');
const server = https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  requestCert: false,
  rejectUnauthorized: false
},app);
//const https = require('https').Server(app);
const io = require('socket.io')(server);
const path = require('path');
const scdlCreate = require('soundcloud-downloader').create;
const Cvlc = require('cvlc');
const homedir = require('os').homedir();
const SpotifyWebApi = require('spotify-web-api-node');
const puppeteer = require('puppeteer');
const mm = require('music-metadata');
const util = require('util'); //Not sure if this is still needed

const port = 3000;
//const sc_client_id = require('./sc_client_id');
//const sc_username = require('./sc_username');
const scdl = scdlCreate({client_id: sc_client_id});
//const spotify_client_id = require('./spotify_client_id');
//const spotify_client_secret = require('./spotify_client_secret');
const { json } = require('body-parser');
let page = puppeteer.page;
const browser = puppeteer.launch({ headless: false, executablePath: '/usr/bin/chromium-browser', args: ["--autoplay-policy=no-user-gesture-required"], ignoreDefaultArgs: ['--mute-audio'] })
  .then(browser => browser.newPage()
  .then(p => { page = p }) )
  .then(() => initSpotifyPlayer());

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: false }));
app.use(express.static('public'))

let player = new Cvlc(); //VLC process
let playerType = ""; //string for spotify/soundcloud/file
let player_isPlaying = false;
let player_seconds, current_song_length = 0;
var current_song;
var Queue = [];
let spotify_token = ""; //Move these two to the multi decleration var below?
let spotify_device_id = "";
let isSpotifyPlayerReady = false;
var spotifyApi, musicDir, sc_client_id, sc_username, spotify_client_id, spotify_client_secret;

//Need to set the spotify token on a refresh when music is playing (clear it when music has been stopped for some time, or if no spotify songs are in the queue, etc)
//Set up to only do this if spotify stuff is set up in the settings
startup();


app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/public/player.html'));
});

async function startup() {
  initSettings(initSpotify);
  initCache();
  updateSeconds();
  //await initSpotify();
}

async function initSpotify() {
  if (spotify_client_id && spotify_client_secret) {
    spotifyApi = new SpotifyWebApi({  //Declare this out here then move init in to function, check if initialized when running?
      clientId: spotify_client_id,
      clientSecret: spotify_client_secret,
      redirectUri: 'https://bob.pi:3000/spotify/redirect'
    });
    console.log("SpotifyWebApi object has been initialized");
    refreshSpotifyToken();
  }
}

async function refreshSpotifyToken() {
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

//Create the cache folders if not already present, used to cache data from api requests for faster UI loading
async function initCache() {
  var cacheDirs = [ 'cache', 'cache/spotify', 'cache/soundcloud', 'cache/localFiles' ];
  cacheDirs.forEach(x => {
    if (!fs.existsSync(x)) {
      fs.mkdirSync(x);
      console.log(x + " cache folder successfully initialized");
    }
  });
}

//Create the settings json file if not already present
async function initSettings(callback) {
  var settingsFile = 'settings.json';
  if (!fs.existsSync(settingsFile)) {
    var settings = {
      musicFolder: '/home/pi/Music',
      scUsername: '',
      scClientID: '',
      spotifyClientID: '',
      spotifyClientSecret: ''
    }
    fs.writeFile(settingsFile, JSON.stringify(settings), (err) => {
      if (err) { //If file is in the cache, send it asap, then check for updates after
      console.log("Error initializing the user settings json file");
      }
      else {
        console.log("Settings json file successfully initialized");
      }
    });
    musicDir = '/home/pi/Music';
  }
  else {
    fs.readFile(settingsFile, {encoding: 'utf-8'}, (err, fileData) => {
      if (err) { //If file is in the cache, send it asap, then check for updates after
        console.log("Unable to load settings.json");
      }
      else {
        var settings = JSON.parse(fileData);
        musicDir = settings.musicFolder;
        sc_username = settings.scUsername;
        sc_client_id = settings.scClientID;
        spotify_client_id = settings.spotifyClientID;
        spotify_client_secret = settings.spotifyClientSecret;
        console.log("Settings have been loaded from settings.json");
        if (callback) {
          callback();
        }
      }
    });
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

//Continuously runs to check the current progress of the song and update the time to send to the clients, as well as
//starting the next song in the queue when the current song finishes
function updateSeconds() {
  var checksSinceChanged = 0; //Keep track of how many checks since the last time the time updated, to check for a song finishing
  var fetchedTime = 0;
  var updateInterval = setInterval(function() {
    if (playerType == "spotify" && player_isPlaying == true) {
        spotifyApi.getMyCurrentPlaybackState()
        .then(function(data) {
          if (data.body) {
            fetchedTime = parseInt(data.body.progress_ms) / 1000;
            //if (spotifySeconds == player_seconds) {
            //  checksSinceChanged += 1;
            //}
            //else {
            //  checksSinceChanged = 0;
            //}
            //player_seconds = spotifySeconds;
          }
        }, function(err) {
          console.log('/player/pause spotifyApigetMyCurrentPlaybackState: Something went wrong!', err);
      });
    }
    else if (player_isPlaying) {
      player.cmd('get_time', function gotResponse(error, response) {
        if (response.length != 1) {
          fetchedTime = response;
          //if (response == player_seconds) {
          //  checksSinceChanged += 1;
          //}
          //else {
          //  checksSinceChanged = 0;
          //}
          //player_seconds = vlcSeconds;
        }
      });
    }
    console.log("current:\t" + player_seconds + "  total:\t" + current_song_length + "  checksSinceChanged: " + checksSinceChanged + "  " + player_isPlaying.toString());

    if (player_isPlaying && (fetchedTime == player_seconds || (fetchedTime + 2) >= current_song_length)) {
      checksSinceChanged += 1
    }
    else {
      checksSinceChanged = 0;
    }
    player_seconds = fetchedTime;
    //Try to check if the current song has finished
    if (player_isPlaying && checksSinceChanged >= 5 && player_seconds > 0 && current_song_length > 0) {
      console.log("-------------\n------------\n----------\n------");
      //If it appears the current song has finished, start the next in the queue if available
      if (Queue.length >= 1) {
        next_song = Queue.shift(); //Get the first queue item
        current_song = next_song.song;
        current_song_length = 0;
        io.emit('queue_remove_item', { key: next_song.key });
        if (current_song.type == 'spotify') {
          playSpotifySong();
        }
        else if (current_song.type == 'soundcloud') {
          playSoundCloudSong();
        }
        else if (current_song.type == 'file') {
          playFile();
        }
      }
      else {
        player_isPlaying = false;
        player_seconds = 0;
        current_song_length = 0;
      }
    }
  }, 450);
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
            player.destroy();
            console.log("previous stream stopped");
            player = new Cvlc();
            callback();
        });
    }
  });
}

function addToQueue(type, song) {
  var key = Date.now();
  Queue.push({ type: type, song: song, key: key });
  io.emit('queue_add_item', { type: type, song: song, key: key });
  console.log("added " + key);
}

function removeFromQueue(key) {
  var index = Queue.findIndex(item => {
    return item.key == key;
  });
  Queue.splice(index, 1);
  io.emit('queue_remove_item', { key: key });
  console.log("removed " + key);
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
    var scopes = ['streaming',
                  'user-read-email',
                  'user-read-private',
                  'playlist-read-private',
                  'playlist-read-collaborative',
                  'user-read-playback-state',
                  'user-modify-playback-state',
                  'user-read-currently-playing',
                  'user-library-read'];
    var state = "pi-state";
    var authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
    res.status(200).json({
      redirect: true,
      spotifyURL: authorizeURL
    });
  }
});

app.get('/test', function(req, res) {
  spotifyApi.getMe().then(function(data) {
    console.log(data.body);
  });
});

app.get('/test2', function(req, res) {
  console.log(io.sockets);
  res.status(200).send("iosockets");
})

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
  socket.emit('queue_set', { queue: Queue });
  io.emit('connection_status', "CONNECTED");
  var sendProgressSeconds = setInterval(function() {
    io.emit('set_song_progress', player_seconds);
    /*if (playerType == "spotify" && player_isPlaying == true) {
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
    }*/
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


app.get('/playlists/soundcloud', (req, res) => {
  var cachedFile = 'cache/soundcloud/playlists.json';

  fs.readFile(cachedFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (!err) { //If file is in the cache, send it asap, then check for updates after
      res.status(200).send({playlists: JSON.parse(fileData)});
    }

    //We have to get the user ID first
    //In the future I should probably set this up to fetch the user ID when the username is added in settings and store it
    scdl.getUser("https://soundcloud.com/" + sc_username).then(userInfo => {
      //var scPlaylistLink = "https://api-v2.soundcloud.com/users/" + userInfo.id + "/playlists_without_albums?client_id=" + sc_client_id + "&limit=10&offset=0";
      var collection = [];
      var offset = 0;

      function getScPlaylist(scPlaylistLink) {
        https.get(scPlaylistLink, (response) => {
          var reqData = '';
          response.on('data', (chunk) => {
            reqData += chunk;
          });
          response.on('end', () => {
            var scData = JSON.parse(reqData);
            collection.push(...scData.collection);
            if (scData.next_href) {
              offset += 10;
              getScPlaylist("https://api-v2.soundcloud.com/users/" + userInfo.id + "/playlists_without_albums?client_id=" + sc_client_id + "&limit=10&offset=" + offset);
            }
            else {      
              if (err) { //File didn't exist
                res.status(200).send({playlists: collection});
                fs.writeFile(cachedFile, JSON.stringify(collection), (err) => {
                  if (err) {
                    console.log('Error writing SoundCloud playlists to cache: ' + err);
                  }
                });
              }
              else if (JSON.stringify(JSON.parse(fileData)) !== JSON.stringify(collection)) { //Available playlists have changed since the last time they were fetched
                io.emit('update_cached_data', { type: 'soundcloud', subType: 'playlists', playlists: collection });
                fs.writeFile(cachedFile, JSON.stringify(collection), (err) => {
                  if (err) {
                    console.log('Error writing SoundCloud playlists to cache: ' + err);
                  }
                });
              }
            }
          });
        });
      }
      getScPlaylist("https://api-v2.soundcloud.com/users/" + userInfo.id + "/playlists_without_albums?client_id=" + sc_client_id + "&limit=10&offset=" + offset);

    });
  });
});

app.get('/playlists/spotify', (req, res) => {
  var cachedFile = 'cache/spotify/playlists.json';
  var collection = [];

  fs.readFile(cachedFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (!err) { //If file is in the cache, send it asap, then check for updates after
      res.status(200).send({playlists: JSON.parse(fileData)});
    }

    function getSpotifyPlaylist(offset) {
      spotifyApi.getUserPlaylists({limit: 10, offset: offset})
        .then(function(reqData) {
          var spotifyData = reqData.body;
          collection.push(...spotifyData.items);
          if (spotifyData.next) {
            getSpotifyPlaylist(offset + 10);
          }
          else {
            if (err) { //File didn't exist
              res.status(200).send({playlists: collection});
              fs.writeFile(cachedFile, JSON.stringify(collection), (err) => {
                if (err) {
                  console.log('Error writing Spotify playlists to cache: ' + err);
                }
              });
            }
            else if (JSON.stringify(JSON.parse(fileData)) !== JSON.stringify(collection)) {
              //For some reason there are 6 letters different every time this is called, even if the playlists aren't different - so it always "updates" them
              io.emit('update_cached_data', { type: 'spotify', subType: 'playlists', playlists: collection });
              fs.writeFile(cachedFile, JSON.stringify(collection), (err) => {
                if (err) {
                  console.log('Error writing Spotify playlists to cache: ' + err);
                }
              });
            }
          }
        });
    }
    getSpotifyPlaylist(0);

  });
});


app.post('/songs/spotify/playlist', (req, res) => { //Might make more sense to change this to a GET request and use a /:playlistID now?
  var playlist = req.body.playlist;
  var cachedFile = 'cache/spotify/' + playlist.id + '.json';
  var songs = [];

  fs.readFile(cachedFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (!err) { //If file is in the cache, send it asap, then check for updates after
      res.status(200).send(JSON.parse(fileData));
    }

    function getPlaylistSongs(offset) {
      spotifyApi.getPlaylistTracks(playlist.id, { limit: 50, offset: offset })
        .then(reqData => {
          var playlistData = reqData.body;
          songs.push(...playlistData.items);
          if (playlistData.next) {
            getPlaylistSongs(offset + 50);
          }
          else {
            var playlistWithSongs = { name: playlist.name, songs: songs };
            if (err) {
              res.status(200).send(playlistWithSongs);
              fs.writeFile('cache/spotify/' + playlist.id + '.json', JSON.stringify(playlistWithSongs), (err) => {
                if (err) {
                  console.log('Error writing spotify playlist ' + playlist.id + ' to cache: ' + err);
                }
              });
            }
            else if (JSON.stringify(JSON.parse(fileData)) !== JSON.stringify(playlistWithSongs)) {
              io.emit('update_cached_data', { type: 'spotify', subType: playlistWithSongs.name, data: playlistWithSongs });
              fs.writeFile(cachedFile, JSON.stringify(playlistWithSongs), (err) => {
                if (err) {
                  console.log('Error writing Spotify playlist' + playlist.id + 'to cache: ' + err);
                }
              });
            }
          }
        });
      }
      getPlaylistSongs(0);
      console.log("after");

  });
});

app.get('/songs/spotify/likes', function(req, res) {
  var cachedFile = 'cache/spotify/likes.json';
  var likedSongs = [];

  fs.readFile(cachedFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (!err) { //If file is in the cache, send it asap, then check for updates after
      res.status(200).send({ likes: JSON.parse(fileData) });
    }

    function getSpotifyLikes(offset) {
      spotifyApi.getMySavedTracks({ limit : 50, offset: offset })
      .then(function(reqData) {
        var spotifyData = reqData.body;
        likedSongs.push(...spotifyData.items);
        if (spotifyData.next) {
          getSpotifyLikes(offset + 50);
        }
        else {
          if (err) { //File was not found
            res.status(200).json({ likes: likedSongs });
            fs.writeFile(cachedFile, JSON.stringify(likedSongs), (err) => {
              if (err) {
                console.log('Error writing spotify likes to cache: ' + err);
              }
            });
          }
          else if (JSON.stringify(JSON.parse(fileData)) !== JSON.stringify(likedSongs)) {
            io.emit('update_cached_data', { type: 'spotify', subType: 'likes', likes: likedSongs });
            fs.writeFile(cachedFile, JSON.stringify(likedSongs), (err) => {
              if (err) {
                console.log('Error writing Spotify likes to cache: ' + err);
              }
            });
          }
        }
      }, function(err) {
        console.log('GET /songs/spotify/likes: Something went wrong!', err);
      });
    }
    getSpotifyLikes(0);

  });
});


app.post('/songs/soundcloud/playlist', (req, res) => {
  var playlist = req.body.playlist;
  var cachedFile = 'cache/soundcloud/' + playlist.id + '.json';
  fs.readFile(cachedFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (!err) { //If file is in the cache, send it asap, then check for updates after
      res.status(200).json({ data: JSON.parse(fileData) });
    }
  
    scdl.getSetInfo(playlist.permalink_url)
      .then(reqData => {
        if (err) { //File didn't exist
          res.status(200).send({ data: reqData });
          fs.writeFile(cachedFile, JSON.stringify(reqData), (err) => {
            if (err) {
              console.log('Error writing soundcloud playlist ' + playlist.id + ' to cache: ' + err);
            }
          });
        }
        else if (JSON.stringify(JSON.parse(fileData)) !== JSON.stringify(reqData)) { //User added/removed/changed songs in playlist since last fetched
          io.emit('update_cached_data', { type: 'soundcloud', subType: playlist.title, data: reqData });
          fs.writeFile(cachedFile, JSON.stringify(reqData), (err) => {
            if (err) {
              console.log('Error writing soundcloud playlist ' + playlist.id + ' to cache: ' + err);
            }
          });
        }
      });
  });
});

app.get('/songs/soundcloud/likes', (req, res) => {
  var cachedFile = 'cache/soundcloud/likes.json';
  var likedSongs = [];

  fs.readFile(cachedFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (!err) { //If file is in the cache, send it asap, then check for updates after
      res.status(200).send({ likes: JSON.parse(fileData) });
    }

    //We have to get the user ID first
    //In the future I should probably set this up to fetch the user ID when the username is added in settings and store it
    scdl.getUser("https://soundcloud.com/" + sc_username).then(userInfo => {
      function getScLikes(scLikesLink) {
        https.get(scLikesLink, (response) => {
          var reqData = '';
          response.on('data', (chunk) => {
            reqData += chunk;
          });
          response.on('end', () => {
            var scData = JSON.parse(reqData);
            likedSongs.push(...scData.collection.filter(x => x.hasOwnProperty('track')));
            if (scData.next_href) {
              getScLikes(scData.next_href.replace('likes?', 'likes?client_id=' + sc_client_id + '&'));
            }
            else {      
              if (err) { //File didn't exist
                res.status(200).send({likes: likedSongs});
                fs.writeFile(cachedFile, JSON.stringify(likedSongs), (err) => {
                  if (err) {
                    console.log('Error writing SoundCloud playlists to cache: ' + err);
                  }
                });
              }
              else if (JSON.stringify(JSON.parse(fileData)) !== JSON.stringify(likedSongs)) { //Likes have changed since the last time they were fetched
                io.emit('update_cached_data', { type: 'soundcloud', subType: 'likes', likes: likedSongs });
                fs.writeFile(cachedFile, JSON.stringify(likedSongs), (err) => {
                  if (err) {
                    console.log('Error writing SoundCloud likes to cache: ' + err);
                  }
                });
              }
            }
          });
        });
      }
      getScLikes("https://api-v2.soundcloud.com/users/" + userInfo.id + "/likes?client_id=" + sc_client_id + "&limit24&offset=0");

    });
  });
});


app.get("/songs/files", (req, res) => {
  //set up to include parent folder and sub folders - display the parent folder name to click on and go back, sub folder list to fetch the files in there and send a new folderObj (convert to app.post with folder dir?)
  var folderName = musicDir.split('/').pop();
  var folderObj = { folderName: folderName, folderPath: musicDir, parentFolder: "", subFolders: [], fileList: [] };
  fs.readdir(musicDir, (err, files) => {
    if(err) {
      console.log(err);
    }
    //console.log(files);
    var filesAdded = 0;
    files.forEach(x => {
      var songPath = path.join(musicDir, x);
      var songObj = { fileName: x, filePath: songPath, title: "", artists: "", duration: 0 };
      //console.log(songPath);
      mm.parseFile(songPath)
        .then(metadata => {
          //console.log(metadata)
          if (metadata.common.title) {
            songObj.title = metadata.common.title;
          }
          else {
            songObj.title = x;
          }

          if (metadata.common.artists) {
            songObj.artists = metadata.common.artists.join(' & ');
          }

          if (metadata.format.duration) {
            songObj.duration = metadata.format.duration;
          }

          folderObj.fileList.push(songObj);
          filesAdded++;
          if (filesAdded == files.length) {
            res.status(200).json({folder: folderObj});
          }
          fs.writeFile('cache/localFiles/' + folderName + '.json', JSON.stringify(folderObj), (err) => {
            if (err) {
              console.log('Error writing soundcloud likes to cache: ' + err);
            }
          });
      });
    });
  });
});


function playSpotifySong() {
  stopCurrentStream(() => {
    playerType = "spotify";
    player_isPlaying = true;
    current_song_length = current_song.duration_ms / 1000;
    const link = current_song.uri;

    console.log("Starting Spotify stream with link: " + link);
    spotifyApi.play({device_id: spotify_device_id, uris: [link]});
    sendCurrentlyPlayingInfo();
  });
}

app.post('/player/play/spotify', function(req, res) {
  if (isSpotifyPlayerReady == false) {
    console.log("Spotify player isn't ready yet, try starting the song again in a few seconds"); //In the future set this up to just wait for the player to be ready (assuming it's being set up and there wasn't an error)
    res.status(503).send({message: "Spotify player isn't ready yet, try starting the song again in a few seconds"});
  }
  else {
    current_song = req.body.spotify_song;
    playSpotifySong();

    res.status(200).json({
      type: playerType,
      song: current_song
    });
  }
});

function playSoundCloudSong() {
  stopCurrentStream(() => {
    playerType = "soundcloud";
    player_isPlaying = true;
    current_song_length = current_song.duration / 1000;
    const link = current_song.permalink_url;

    current_link = link;
    scdl.download(link).then(stream => {
      player.play(stream, function startedStream() {
        console.log("playing from: " + link);
        sendCurrentlyPlayingInfo()
      });
    });
  });
}

app.post("/player/play/soundcloud", (req, res) => {
  current_song = req.body.soundcloud_song;
  playSoundCloudSong();

  res.status(200).json({
    type: playerType,
    song: current_song
  });
});

function playFile() {
  stopCurrentStream(() => {
    playerType = "file";
    player_isPlaying = true;
    console.log(req.body);
    const file_path = current_song.filePath;
    current_song_length = current_song.duration;
    console.log('Playing from file: ' + file_path);

    player.play(file_path, function startedStream() {
      console.log("playing from: " + file_path);
      sendCurrentlyPlayingInfo()
    });
  });
}

app.post("/player/play/file", (req, res) => {
  current_song = req.body.file;
  playFile();

  res.status(200).json({
    type: playerType,
    song: current_song
  });
});

//app.get('/player/queue', (req, res) => {
  //console.log(JSON.stringify(Queue));
//  res.status(200).send({ queue: Queue });
//});

app.get('/player/queue/clear', (req, res) => {
  Queue = [];
  io.emit('queue_clear');
  console.log("Queue has been cleared");
  res.status(200).send({ message: "Queue has been cleared" });
});

app.post('/player/queue/add', (req, res) => {
  addToQueue(req.body.type, req.body.song);
  console.log("Added to queue");
  res.status(200).send({ message: "Added to the queue" });
});

app.post('/player/queue/remove', (req, res) => {
  removeFromQueue(req.body.key);
  io.emit('queue_remove_item', { key: req.body.key });
  console.log("Removed from queue");
  res.status(200).send({ message: "Removed from the queue" });
});

app.get('/player/pause', (req, res) => {
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


//Get the settings
app.get('/settings', (req, res) => {
  var settingsFile = 'settings.json';
  fs.readFile(settingsFile, {encoding: 'utf-8'}, (err, fileData) => {
    if (err) { //If file is in the cache, send it asap, then check for updates after
      res.status(404).send({ message: "Settings file does not exist yet" });
    }
    else {
      res.status(200).send({ settings: fileData });
    }
  });
});

//Save the settings
app.post('/settings', (req, res) => {
  var settingsFile = 'settings.json';
  var settings = req.body.settings;
  fs.writeFile(settingsFile, JSON.stringify(settings), (err) => {
    if (err) { //If file is in the cache, send it asap, then check for updates after
      res.status(500).send({ message: "Error savings the user settings" });
    }
    else {
      res.status(200).send({ message: "Settings successfully saved" });
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
  io.emit('connection_status', "DISCONNECTED");
  process.exit(1);
});
