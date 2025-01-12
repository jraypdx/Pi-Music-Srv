# Pi-Music-Srv
Another Raspberry Pi music server, this time using Node.js!


### Features:
 - Load, queue, and play music from SoundCloud, Spotify, and your local mp3/wav/flac files to the speakers connected to your Raspberry Pi
 - Realtime web app that syncs between devices, allowing you to change what's playing from anywhere in your house or allow multiple people to curate a playlist at once


### How to get it running on your Raspberry Pi:
 - This section is being updated as I slowly familiarize myself with the codebase again and get it working on a fresh Pi
 - Note:  The cert + key added to the repo are an unsigned dummy pair used for testing, and you will need to click "advanced options" and "proceed" when first visiting the server in a browser
 - **SoundCloud** setup
     1. Add your SoundCloud username (as it shows up in the URL when viewing your profile) and your SoundCloud client_id to the settings page (or manually in settings.json) and save the settings (TODO: I don't think server needs to be restarted after this but need to figure out if it updates correctly)
     2. To find your SoundCloud account's client_id:
         1.  Open SoundCloud in your browser while logged in
         2.  Open developer tools
         3.  Go to the network tab
         4.  Refresh the page
         5.  A lot of the last requests to be made when the page is loading (ex. Discover page or your profile page) will show up like me?client_id=xxxxxxx - click on one of those, then you will see client_id under Query String Parameters or URL parameters and you can copy the value from it


### Example screenshots of the web app on desktop and mobile:

#### Main player
<img src="ExamplePics/MainPlayer.png" width="80%" height="80%">


#### Main player side panel for music selection and queue panel
<img src="ExamplePics/SidePanel.png" width="30%" height="30%"> . . . . . . . . . . <img src="ExamplePics/QueuePanel.png" width="50%" height="50%">


#### Mobile player and mobile player queue
<img src="ExamplePics/MainPlayer_Mobile.jpg" width="30%" height="30%"> . . . . . . . . . . <img src="ExamplePics/QueuePanel_Mobile.jpg" width="30%" height="30%">




# Scripts
A couple of the Python scripts I use:
 - pi-power-button | Adds a power button to the Raspberry Pi, as well as blinking a power LED when powering off (based on: https://github.com/Howchoo/pi-power-button )
     - Contains scripts to add and remove from boot using init.d
 - pi-power-led | Turns on a power LED when the Pi boots up
     - Can be added to any startup method that allows GPIO access (I use rc.local, see pi-volume-control)
 - pi-volume-control | Uses two GPIO buttons to raise and lower the alsa mixer volume, as well as muting it when both are pushed, with 4 LEDs to display the volume (mute, 40%+, 70%+, 90%+) (based on: https://gist.github.com/peteristhegreat/3c94963d5b3a876b27accf86d0a7f7c0 )
     - Add to startup by adding the script in a line to /etc/rc.local with an ampersand (ex. "/home/pi/Documents/pi-power-buttons.py &")
