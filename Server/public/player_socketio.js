var socket = io();

document.getElementById("ProgressBarFull").addEventListener("click", getClickPosition, false);

socket.on('set_song_progress', function(seconds) {
    if (seconds == (currentlyPlayingTotalSeconds - 1)) { //Seems like the VLC player rounds down for seconds, so if we rounded up it probably won't match and we have to manually set it here
        document.getElementById("CurrentlyPlayingProgress").innerText = document.getElementById("CurrentlyPlayingLength").innerText;
        document.getElementById("ProgressBarPosition").style.width = "100.00%";
        return;
    }
    var secs = parseInt(seconds);
    var playerSeconds = new Date(secs * 1000).toISOString().slice(14, 19);
    var playerProgressPct = (secs / currentlyPlayingTotalSeconds) * 100;

    document.getElementById("CurrentlyPlayingProgress").innerText = playerSeconds;
    document.getElementById("ProgressBarPosition").style.width = playerProgressPct + "%";
});

socket.on('connection_status', function(status) {
    var serverStatus = document.getElementById("ServerConnectionStatus");
    if (status == "CONNECTED") {
        serverStatus.src = "images/dot_green.png";
        serverStatus.style = "position: fixed; bottom: 0; right: 0; margin: 4px; width: 15px; height: 15px;";
    }
    else if (status == "DISCONNECTED") {
        serverStatus.style = "filter: invert(100.00); position: fixed; bottom: 0; right: 0; margin: 4px; width: 15px; height: 15px;";
    }
});

socket.on('popup_message', function(message) {
    alert(message);
});

socket.on('update_song_info', function(data) {
    setCurrentlyPlayingInfo(data);
});

socket.on('update_cached_data', function(data) {
    var title = document.getElementById('SongDisplayTitle');
    if (data.type == 'soundcloud') {
        if (data.subType == 'likes') {
            if (title.innerText.toLowerCase().includes(data.type) && title.innerText.toLowerCase().includes(data.subType)) {
                console.log("Updating SoundCloud likes");
                console.log(data);
                setSoundCloudLikes(data);
            }
        }
        else if (data.subType == 'playlists') {
            var sidepanel = document.getElementById('sidebarPanel');
            var sidepanelTitle = document.getElementById('sidepanelTitle');
            if (sidepanel.isOpen == "true" && sidepanelTitle.innerText.toLowerCase() == data.type) {
                console.log("Updating SoundCloud playlists");
                console.log(data);
                setSoundCloudPlaylists(data);
            }
        }
        else { //if not 'likes' or 'playlists', subType will be a playlist name
            if (title.innerText.toLowerCase().includes(data.type) && title.innerText.toLowerCase().includes(data.subType)) {
                console.log("Updating SoundCloud playlist songs for " + data.subType);
                console.log(data);
                setSoundCloudPlaylistSongs(data.data);
            }
        }
    }
    else if (data.type == 'spotify') {
        if (data.subType == 'likes') {
            if (title.innerText.toLowerCase().includes(data.type) && title.innerText.toLowerCase().includes(data.subType)) {
                console.log("Updating Spotify likes");
                console.log(data);
                setSpotifyLikes(data);
            }
        }
        else if (data.subType == 'playlists') {
            var sidepanel = document.getElementById('sidebarPanel');
            var sidepanelTitle = document.getElementById('sidepanelTitle');
            if (sidepanel.isOpen == "true" && sidepanelTitle.innerText.toLowerCase() == data.type) {
                console.log("Updating Spotify playlists");
                console.log(data);
                setSpotifyPlaylists(data);
            }
        }
        else { //if not 'likes' or 'playlists', subType will be a playlist name
            if (title.innerText.toLowerCase().includes(data.type) && title.innerText.toLowerCase().includes(data.subType)) {
                console.log("Updating SoundCloud playlist songs for " + data.subType);
                console.log(data);
                setSpotifyPlaylistSongs(data.data);
            }
        }
    }
});

socket.on('queue_set', function(data) {
    var queueItems = document.getElementById("queueItems");
    queueItems.innerHTML = "";
    data.queue.forEach(x => {
        addQueueItem(x.type, x.song, x.key);
    });
});

socket.on('queue_clear', function() {
    var queueItems = document.getElementById("queueItems");
    queueItems.innerHTML = "";
});

socket.on('queue_add_item', function(data) {
    addQueueItem(data.type, data.song, data.key);
});

socket.on('queue_remove_item', function(data) {
    var queueItems = document.getElementById("queueItems");
    var items = document.getElementsByClassName("queueItem");
    for (var i = 0; i < items.length; i++) {
        var item = items.item(i);
        if (item.key == data.key) {
            queueItems.removeChild(item);
        }
    }
});