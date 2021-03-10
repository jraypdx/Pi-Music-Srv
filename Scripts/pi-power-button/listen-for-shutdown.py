#!/usr/bin/env python


import RPi.GPIO as GPIO
import subprocess
import time

GPIO.setmode(GPIO.BCM)
GPIO.setup(3, GPIO.IN, pull_up_down=GPIO.PUD_UP)  # GPIO pin for the power button
GPIO.setup(25, GPIO.OUT)  # GPIO pin for the power LED (turned on in another script using /etc/rc.local)
GPIO.wait_for_edge(3, GPIO.FALLING)  # this waits for the button to be pressed before continuing

# blink the LED before powering down
for i in range(0, 3):
    time.sleep(0.2)
    GPIO.output(25, GPIO.LOW)
    time.sleep(0.2)
    GPIO.output(25, GPIO.HIGH)
# leave it on so that it turns off when the pi is fully shut down

subprocess.call(['shutdown', '-h', 'now'], shell=False)
