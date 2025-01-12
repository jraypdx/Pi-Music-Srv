# Pi-Music-Srv
Another Raspberry Pi music server, this time using Node.js!


### Features:
 - Load, queue, and play music from SoundCloud, Spotify, and your local mp3/wav/flac files to the speakers connected to your Raspberry Pi
 - Realtime web app that syncs between devices, allowing you to change what's playing from anywhere in your house or allow multiple people to curate a playlist at once


### How to get it running on your Raspberry Pi:
 - This section is being updated as I slowly familiarize myself with the codebase again and get it working on a fresh Pi
 - Note:  The cert + key added to the repo are an unsigned dummy pair used for testing, and you will need to click "advanced options" and "proceed" when first visiting the server in a browser
 - Clone the repo, navigate to the Server folder, run "npm install" (will need to run "sudo apt install nodejs" and possibly "sudo apt install npm" before if you don't have them installed)
 - Start the server using "export DISPLAY=:0 && node server.js" from the Server folder (**TODO: Requires a connected display for the Spotify player authentication and workaround - I need to figure out how I had a dummy display script set up in the past and add it as an option here if no display is found**)
 - **SoundCloud** setup
     1. Add your SoundCloud username (as it shows up in the URL when viewing your profile) and your SoundCloud client_id to the settings page (or manually in settings.json) and save the settings (TODO: I don't think server needs to be restarted after this but need to figure out if it updates correctly)
     2. To find your SoundCloud account's client_id:
         1.  Open SoundCloud in your browser while logged in
         2.  Open developer tools
         3.  Go to the network tab
         4.  Refresh the page
         5.  A lot of the last requests to be made when the page is loading (ex. Discover page or your profile page) will show up like me?client_id=xxxxxxx - click on one of those, then you will see client_id under Query String Parameters or URL parameters and you can copy the value from it
 - **Spotify** setup **(NOTE: Requires a premium Spotify account)** - **TODO: Simplify this and figure out URL stuff**
     1. Edit your hosts file and add "raspberry_pi_ip    bob.pi" as a line where raspberry_pi_ip is the local IP for the raspberry Pi that you're using (this is a temp workaround due to Spotify needing a "valid" (aka domain/url) redirect URL)
     2. Visit https://developer.spotify.com/dashboard and create a new app with access to the Web API and Web Playback SDK (not positive both are needed... will edit if I figure out later) and add "https://bob.pi:3000/spotify/redirect" as a redirect URL (**TODO: https://pi_ip:3000/spotify/redirect might work here without doing the bob.pi workaround?)
     3. Once it's created, copy and paste the client ID and client secret of your app into the server settings and save
     4. Connect your account by visiting https://bob.pi:3000/spotify/auth (or your raspberry pi IP in place of bob.pi) from another computer with the server running on the Pi, and log in to Spotify and allow the app to access your account


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
