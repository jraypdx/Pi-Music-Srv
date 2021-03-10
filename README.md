# Pi-Music-Srv
Another Raspberry Pi music server


There are already several options out there for streaming music to a Rasberry Pi.  I've tried a few, and the idea behind them is awesome, but they end up being slow and clunky.

My goal with this project is to create a very snappy and leight-weight solution that can stream from local files, Soundcloud, and Spotify.  It should also hopefully feature the ability to queue music and set up a playlist with a combination of all three sources.


### Current:
 - Super basic ability to play one song at a time from Soundcloud
 - Super basic ability to display files from the user's home directory Music folder
 - Play local files (buggy, player tries to keep playing after a song has finished)

### Planned:
 - Display local files with the ability to sort by name, artist, file write time
 - Read tags from and play .mp3, .wav, .flac
 - Display user likes and public playlists from Soundcloud
 - Display user likes and playlists from Spotify
 - Local file streaming
 - Soundcloud streaming
 - Spotify streaming
 - Queue system that can manage moving between all 3 sources



# Scripts
A couple of the Python scripts I use:
 - pi-power-button, adds a power button to the Raspberry Pi, as well as blinking a power LED when powering off (based on: https://github.com/Howchoo/pi-power-button )
     - Contains scripts to add and remove from boot using init.d
 - pi-power-led, turns on a power LED when the Pi boots up
     - Add to startup by adding the script in a line to /etc/rc.local with an ampersand (ex. "/home/pi/Documents/pi-power-script.py &")
