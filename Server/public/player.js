var currentlyPlayingTotalSeconds = 0;
var currentlyPlayingURL = "";

function getSettings() {
    fetch('/settings')
    .then(response => {
        if (response.status == 200) {
            response.json().then(data => {
                var settings = JSON.parse(data.settings);
                //console.log(JSON.parse(settings));
                if (!settings) {
                    return;
                }
                if (settings.musicFolder) {
                    document.getElementById("musicFolder").value = settings.musicFolder;
                }
                if (settings.scUsername) {
                    document.getElementById("scUsername").value = settings.scUsername;
                }
                if (settings.scClientID) {
                    document.getElementById("scClientID").value = settings.scClientID;
                }
                if (settings.spotifyClientID) {
                    document.getElementById("spotifyClientID").value = settings.spotifyClientID;
                }
                if (settings.spotifyClientSecret) {
                    document.getElementById("spotifyClientSecret").value = settings.spotifyClientSecret;
                }
            })
        }
    });
}

function saveSettings() {
    fetch('/settings', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ settings: {
                musicFolder: document.getElementById("musicFolder").value,
                scUsername: document.getElementById("scUsername").value,
                scClientID:document.getElementById("scClientID").value,
                spotifyClientID: document.getElementById("spotifyClientID").value,
                spotifyClientSecret: document.getElementById("spotifyClientSecret").value
            }
        })
    })
        .then(response => {
            console.log(response);
            document.getElementById("settingspanel").style.visibility = "hidden";
        });
}

function spotifyAuth() {
    fetch('/spotify/auth')
        .then(response => response.json())
        .then(data => {
            if (data.redirect == true) {
                window.open(data.spotifyURL);
            }
        });
}
function openSongTrackPage() {
    if (currentlyPlayingURL) {
        window.open(currentlyPlayingURL);
    }
}
function pause() {
    fetch('/player/pause')
        .then(response => response.json())
        .then(data => console.log(data));
}
function setCurrentlyPlayingInfo(data) {
    if (!data) {
        return;
    }
    else if (data.type == "none") {
        console.log("No song currently playing");
    }
    else if (data.type == "file") {
        let song = data.song;
        //Set up reading in audio file tags then get this all set up
        document.getElementById('source_icon').hidden = true;
        document.getElementById("CurrentlyPlayingImage").src = "";
        document.getElementById("CurrentlyPlayingTitle").innerText = song.title;
        document.getElementById("CurrentlyPlayingArtist").innerText = song.artists;
        currentlyPlayingTotalSeconds = song.duration;
        document.getElementById("CurrentlyPlayingLength").innerText = new Date(currentlyPlayingTotalSeconds * 1000).toISOString().slice(14, 19);
    }
    else if (data.type == "soundcloud") {
        let song = data.song;
        document.getElementById('source_icon').hidden = false;
        document.getElementById('source_icon_image').src = "images/soundcloud_mini.png";
        document.getElementById("CurrentlyPlayingTitle").innerText = song.title;
        document.getElementById("CurrentlyPlayingArtist").innerText = song.user.username;
        document.getElementById("CurrentlyPlayingImage").src = song.artwork_url.replace("large.jpg", "t500x500.jpg");
        document.getElementById("CurrentlyPlayingProgress").innerText = "0:00";
        currentlyPlayingTotalSeconds = Math.round(song.duration / 1000);
        document.getElementById("CurrentlyPlayingLength").innerText = new Date(currentlyPlayingTotalSeconds * 1000).toISOString().slice(14, 19);
        document.getElementById("ProgressBarPosition").style.width = "0.00%";
        currentlyPlayingURL = data.permalink_url;
    }
    else if (data.type == "spotify") {
        let song = data.song;
        document.getElementById('source_icon').hidden = false;
        document.getElementById('source_icon_image').src = "images/spotify.png";
        document.getElementById("CurrentlyPlayingTitle").innerText = song.name;
        document.getElementById("CurrentlyPlayingArtist").innerText = song.artists.map(x => x.name).join();
        document.getElementById("CurrentlyPlayingImage").src = song.album.images[0].url;
        document.getElementById("CurrentlyPlayingProgress").innerText = "0:00";
        currentlyPlayingTotalSeconds = Math.round(song.duration_ms / 1000);
        document.getElementById("CurrentlyPlayingLength").innerText = new Date(currentlyPlayingTotalSeconds * 1000).toISOString().slice(14, 19);
        document.getElementById("ProgressBarPosition").style.width = "0.00%";
        currentlyPlayingURL = song.external_urls.spotify;
    }
}
function setProgressBarPosition(pct)
{
    document.getElementById("ProgressBarPosition").style.width = pct + "%";
}
function getClickPosition(e) {
    var barLeft = getPosition(e.currentTarget).x;
    var barWidth = document.getElementById("ProgressBarFull").offsetWidth;
    var xPosition = e.clientX - barLeft;
    var pct = (xPosition / barWidth) * 100

    socket.emit('seek', Math.round(currentlyPlayingTotalSeconds * (pct / 100)));
    setProgressBarPosition(pct);

}
// Helper function to get an element's exact position
function getPosition(el) {
    var xPos = 0;
    var yPos = 0;

    while (el) {
        if (el.tagName == "BODY") {
            // deal with browser quirks with body/window/document and page scroll
            var xScroll = el.scrollLeft || document.documentElement.scrollLeft;
            var yScroll = el.scrollTop || document.documentElement.scrollTop;

            xPos += (el.offsetLeft - xScroll + el.clientLeft);
            yPos += (el.offsetTop - yScroll + el.clientTop);
        } else {
            // for all other non-BODY elements
            xPos += (el.offsetLeft - el.scrollLeft + el.clientLeft);
            yPos += (el.offsetTop - el.scrollTop + el.clientTop);
        }

        el = el.offsetParent;
    }
    return {
        x: xPos,
        y: yPos
    };
}
function populateFiles() {
    hideSidepanel(); //Close the side panel if it was open
    fetch('/songs/files')
        .then(response => response.json())
        .then(data => {
            document.getElementById("SongDisplayTitle").innerText = data.folder.folderPath;
            var songDisplayTable = document.getElementById("SongDisplayTable");
            songDisplayTable.innerHTML = '';
            for (i = 0; i < data.folder.fileList.length; i++) {
                songJSON = {
                    title: data.folder.fileList[i].title,
                    artists: data.folder.fileList[i].artists,
                    filePath: data.folder.fileList[i].filePath
                }
                addSongRow(songJSON.title, songJSON.artists, songJSON, 'file');
                //console.log(data.local_files[i]);
                /*var row = songDisplayTable.insertRow(-1);
                var col1 = row.insertCell(-1);
                var col2 = row.insertCell(-1);
                var col3 = row.insertCell(-1);
                row.style = "cursor: pointer;";
                row.songJSON = { file: data.folder.fileList[i] };
                //row.onclick = playSpotifySong(this.songJSON);
                col1.innerText = data.folder.fileList[i].title;
                col2.innerText = data.folder.fileList[i].artists; //Artists goes here
                col3.innerHTML = "<button class='queueButton'>Queue</button>";
                col1.addEventListener('click', function(){ playFile(this.parentElement.songJSON); });*/
            }
        });
}
function playFile(song) {
    console.log(song);
    console.log(song.filename);
    fetch('/player/play/file', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file: song })
    })
        .then(response => response.json())
        .then(data => {
            console.log(data)
        });
}
function getSoundCloudLikes() {
    fetch('/songs/soundcloud/likes')
        .then(response => response.json())
        .then(data => setSoundCloudLikes(data));
}
function setSoundCloudLikes(data) {
    //console.log(data);
    document.getElementById("SongDisplayTitle").innerText = "SoundCloud: likes";
    var songDisplayTable = document.getElementById("SongDisplayTable");
    songDisplayTable.innerHTML = '';
    for (i = 0; i < data.likes.length; i++) {
        addSongRow(data.likes[i].track.title, data.likes[i].track.user.username, data.likes[i].track, "soundcloud");
    }
    hideSidepanel();
}
function playSoundCloudSong(song) {
    fetch('/player/play/soundcloud', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({soundcloud_song: song})
    }).then(response => response.json())
        .then(data => {
            console.log(song)
        });
}
function getSpotifyLikes() {
    fetch('/songs/spotify/likes')
        .then(response => response.json())
        .then(data => setSpotifyLikes(data));
}
function setSpotifyLikes(data) {
    document.getElementById("SongDisplayTitle").innerText = "Spotify: likes";
    var songDisplayTable = document.getElementById("SongDisplayTable");
    songDisplayTable.innerHTML = "";
    for (i = 0; i < data.likes.length; i++) {
        addSongRow(data.likes[i].track.name, data.likes[i].track.artists.map(x => x.name).join(', '), data.likes[i].track, "spotify");
    }
    hideSidepanel();
}
function getSpotifyPlaylistSongs(playlist) {
    fetch('/songs/spotify/playlist', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({playlist: playlist})
    }).then(response => response.json())
        .then(data => setSpotifyPlaylistSongs(data));
}
function setSpotifyPlaylistSongs(data) {
    console.log(data);
    document.getElementById("SongDisplayTitle").innerText = "Spotify: " + data.name;
    var songDisplayTable = document.getElementById("SongDisplayTable");
    songDisplayTable.innerHTML = "";
    for (i = 0; i < data.songs.length; i++) {
        addSongRow(data.songs[i].track.name, data.songs[i].track.artists.map(x => x.name).join(', '), data.songs[i].track, "spotify");
    }
    hideSidepanel();
}
function getSpotifyPlaylists() {
    fetch('/playlists/spotify')
        .then(response => response.json())
        .then(data => setSpotifyPlaylists(data));
}
function setSpotifyPlaylists(data) {
    var sidebarButtons = document.getElementById("sidepanelButtonList");
    sidebarButtons.innerHTML = "";
    data.playlists.forEach(x => {
        var playlist = document.createElement("div");
        var img = document.createElement("img");

        img.id = "playlistImg";
        if (x.images[0]) {
            //console.log(x.images[0].url);
            img.src = x.images[0].url;
            playlist.appendChild(img);
        }

        var label = document.createElement("div");
        label.innerText = x.name;
        label.id = "playlistText";
        playlist.appendChild(label);

        playlist.id = "sidepanelButton";
        playlist.playlistJSON = x;
        playlist.addEventListener('click', function(){ getSpotifyPlaylistSongs(this.playlistJSON); });
        sidebarButtons.appendChild(playlist);
    });
}
function getSoundCloudPlaylistSongs(playlist) {
    fetch('/songs/soundcloud/playlist', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({playlist: playlist})
    }).then(response => response.json())
        .then(data => setSoundCloudPlaylistSongs(data.data));
}
function setSoundCloudPlaylistSongs(data) {
    console.log(data);
    document.getElementById("SongDisplayTitle").innerText = "SoundCloud: " + data.title;
    var songDisplayTable = document.getElementById("SongDisplayTable");
    songDisplayTable.innerHTML = "";
    for (i = 0; i < data.tracks.length; i++) {
        addSongRow(data.tracks[i].title, data.tracks[i].user.username, data.tracks[i], "soundcloud");
    }
    hideSidepanel();
}
function getSoundCloudPlaylists() {
    fetch('/playlists/soundcloud')
        .then(response => response.json())
        .then(data => setSoundCloudPlaylists(data));
}
function setSoundCloudPlaylists(data) {
    var sidebarButtons = document.getElementById("sidepanelButtonList");
    sidebarButtons.innerHTML = "";
    data.playlists.forEach(x => {
        var playlist = document.createElement("div");
        var img = document.createElement("img");

        img.id = "playlistImg";
        if (x.artwork_url) {
            img.src = x.artwork_url;
            playlist.appendChild(img);
        }
        else {
            img.src = x.tracks[0].artwork_url;
            playlist.appendChild(img);
        }
        
        var label = document.createElement("div");
        label.innerText = x.title;
        label.id = "playlistText";
        playlist.appendChild(label);

        playlist.id = "sidepanelButton";
        playlist.playlistJSON = x;
        playlist.addEventListener('click', function(){ getSoundCloudPlaylistSongs(this.playlistJSON); });
        sidebarButtons.appendChild(playlist);
    });
}
function playSpotifySong(song) {
    console.log(song)
    fetch('/player/play/spotify', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({spotify_song: song})
    }).then(response => response.json())
        .then(data => {
            console.log(song)
        });
}

function addSongRow(c1, c2, songJSON, type) {
    var songDisplayTable = document.getElementById("SongDisplayTable");
    var row = songDisplayTable.insertRow(-1);
    var col1 = row.insertCell(-1);
    var col2 = row.insertCell(-1);
    var col3 = row.insertCell(-1);
    var qButton = document.createElement("button");
    col1.style = "cursor: pointer;";
    row.songJSON = songJSON
    col1.innerText = c1
    col2.innerText = c2
    col3.appendChild(qButton);
    qButton.className = "queueButton";
    qButton.innerText = "Queue";
    qButton.onclick = function(){ addSongtoQueue(type, songJSON); };
    if (type == "file") {
        col1.addEventListener('click', function(){ playFile(this.parentElement.songJSON); });
    }
    else if (type == "soundcloud") {
        col1.addEventListener('click', function(){ playSoundCloudSong(this.parentElement.songJSON); });
    }
    else if (type == "spotify") {
        col1.addEventListener('click', function(){ playSpotifySong(this.parentElement.songJSON); });
    }
}

function addSongtoQueue(type, song) {
    fetch('/player/queue/add', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ type: type, song: song })
    }).then(response => response.json())
        .then(data => {
            console.log(data)
        });
}

/*function getQueue() {
    fetch('/player/queue')
        .then(response => response.json())
        .then(data => {
            data.queue.forEach(x => {
                //console.log(x.type);
                addQueueItem(x.type, x.song);
            });
        });
}*/

function removeQueueItem(key) {
    var toSend = { key: key };
    fetch('/player/queue/remove', {
        method: 'post',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(toSend)
    }).then(response => response.json())
        .then(data => {
            console.log(data)
        });
    //toggleQueue();
    //toggleQueue();
}

function addQueueItem(type, song, key) {
    var queueItems = document.getElementById("queueItems");
    var item = document.createElement("div");
    item.className = "queueItem";
    //item.itemJSON = {type: type, song: song};
    item.key = key;
    var text = document.createElement("div");
    var button = document.createElement("button");
    button.className = "queueXButton";
    button.innerText = "X";
    button.addEventListener('click', function(){ removeQueueItem(this.parentElement.key); });

    var icon = document.createElement("img");
    icon.className = "queueIcon";
    if (type == "file") {
        icon.src = "images/folder.png";
    }
    else if (type == "spotify") {
        icon.src = "images/spotify.png";
    }
    else if (type == "soundcloud") {
        icon.src = "images/soundcloud.png";
    }

    item.appendChild(icon);
    item.appendChild(text);
    item.appendChild(button);

    if (type == "file") {
        //Set up reading in audio file tags then get this all set up
        text.innerText = song.title;
        if (song.artists) {
            text.innerText += "  |  " + song.artists;
        }
    }
    else if (type == "soundcloud") {
        text.innerText = song.title + "  |  " + song.user.username;
    }
    else if (type == "spotify") {
        text.innerText = song.name + "  |  " + song.artists.map(x => x.name).join();
    }

    queueItems.appendChild(item);
}

function toggleQueue() {
    var queuePanel = document.getElementById("queuePanel");
    //var queueItems = document.getElementById("queueItems");
    //queueItems.innerHTML = "";

    if (queuePanel.isOpen == "true") {
        queuePanel.isOpen = "false";
        queuePanel.style.maxHeight = "0px";
        queuePanel.style.padding = "0px";
        queuePanel.style.borderWidth = "0px";
    }
    else {
        queuePanel.isOpen = "true";
        queuePanel.style.maxHeight = "60%";
        queuePanel.style.padding = "8px";
        queuePanel.style.borderWidth = "1px 1px 0px 1px";
        //getQueue();

    }
}

function clearQueue() {
    fetch('/player/queue/clear')
        .then(response => response.json())
        .then(data => console.log(data.message));
    toggleQueue();
}

function settingsButtonClick() {
    var settingsPanel = document.getElementById("settingspanel");
    if (settingsPanel.style.visibility == "visible") {
        settingsPanel.style.visibility = "hidden";
    }
    else {
        getSettings();
        settingsPanel.style.visibility = "visible";
    }
}

function sidebarButtonClick(who) {
    var sidebar = document.getElementById("sidebarPanel");
    
    // If the same button was clicked again to close it
    if (sidebar.isOpen == "true" && sidebar.lastClicked == who) {
        hideSidepanel();
    }
    else if (sidebar.isOpen == "false" && sidebar.lastClicked == who) { //If user opens the last one they opened, don't fetch again since it is already populated
        openSidepanel();
    }
    else {
        sidebar.lastClicked = who;
        document.getElementById("sidepanelButtonList").innerHTML = ""; //Clear out the previously set playlists

        if (who == "spotify") {
            document.getElementById("sidepanelTitle").innerText = "Spotify";
            getSpotifyPlaylists();
            document.getElementById("sidepanelButtonLikes").onclick = function() { getSpotifyLikes(); };
        }
        else if (who == "soundcloud") {
            document.getElementById("sidepanelTitle").innerText = "SoundCloud";
            getSoundCloudPlaylists();
            document.getElementById("sidepanelButtonLikes").onclick = function() { getSoundCloudLikes(); };
        }

        openSidepanel();
    }
}
function openSidepanel() { 
    var sidebar = document.getElementById("sidebarPanel");
    sidebar.style.width = "250px"; 
    sidebar.style.padding = "8px";
    sidebar.isOpen = "true";
}
function hideSidepanel() { 
    var sidebar = document.getElementById("sidebarPanel");
    sidebar.style.width = "0px"; 
    sidebar.style.padding = "0px";
    sidebar.isOpen = "false";
}
